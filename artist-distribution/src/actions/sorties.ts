'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { creerClientServeur } from '@/lib/supabase/server';
import { exigerUtilisateur } from '@/lib/auth';
import { aujourdHuiIso } from '@/lib/format';
import {
  erreursParChamp,
  schemaSortie,
  texte,
} from '@/lib/validation';
import type { Sortie } from '@/types/database';

export interface ResultatSortie {
  ok: boolean;
  message?: string;
  erreursChamps?: Record<string, string>;
  id?: string;
}

const STATUTS_MODIFIABLES = ['brouillon', 'informations_a_corriger'];

async function contexte() {
  const utilisateur = await exigerUtilisateur('/espace');
  const supabase = await creerClientServeur();
  return { utilisateur, supabase };
}

/** Vérifie qu'un abonnement actif (non expiré) existe pour cet utilisateur. */
async function aUnAbonnementActif(userId: string): Promise<boolean> {
  const supabase = await creerClientServeur();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, statut, fin')
    .eq('user_id', userId)
    .eq('statut', 'actif')
    .order('fin', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  return !data.fin || new Date(data.fin).getTime() > Date.now();
}

function champsDepuisFormulaire(formData: FormData) {
  const verif = schemaSortie.safeParse({
    titre: texte(formData, 'titre'),
    type_sortie: texte(formData, 'type_sortie'),
    artiste_principal: texte(formData, 'artiste_principal'),
    artistes_invites: texte(formData, 'artistes_invites'),
    genre: texte(formData, 'genre'),
    langue: texte(formData, 'langue'),
    date_sortie_souhaitee: texte(formData, 'date_sortie_souhaitee'),
    infos_production: texte(formData, 'infos_production'),
    auteurs_compositeurs: texte(formData, 'auteurs_compositeurs'),
    credits: texte(formData, 'credits'),
    liste_titres: texte(formData, 'liste_titres'),
  });
  return verif;
}

/**
 * Enregistre (ou met à jour) un brouillon de demande de distribution.
 * Les fichiers sont envoyés séparément, directement vers Supabase Storage.
 */
export async function enregistrerSortie(formData: FormData): Promise<ResultatSortie> {
  const { utilisateur, supabase } = await contexte();

  const verif = champsDepuisFormulaire(formData);
  if (!verif.success) {
    return {
      ok: false,
      message: 'Merci de corriger les champs signalés.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const donnees = verif.data;
  const date = donnees.date_sortie_souhaitee || null;

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: 'La date de sortie n’est pas valide.', erreursChamps: { date_sortie_souhaitee: 'Date invalide.' } };
  }

  const champs = {
    titre: donnees.titre,
    type_sortie: donnees.type_sortie,
    artiste_principal: donnees.artiste_principal,
    artistes_invites: donnees.artistes_invites || null,
    genre: donnees.genre || null,
    langue: donnees.langue || null,
    date_sortie_souhaitee: date,
    infos_production: donnees.infos_production || null,
    auteurs_compositeurs: donnees.auteurs_compositeurs || null,
    credits: donnees.credits || null,
    liste_titres: donnees.liste_titres || null,
  };

  const identifiant = texte(formData, 'sortie_id');

  if (identifiant) {
    const { data: existante, error: erreurLecture } = await supabase
      .from('releases')
      .select('id, statut, user_id')
      .eq('id', identifiant)
      .maybeSingle();

    if (erreurLecture || !existante || existante.user_id !== utilisateur.id) {
      return { ok: false, message: 'Demande introuvable.' };
    }
    if (!STATUTS_MODIFIABLES.includes(existante.statut)) {
      return {
        ok: false,
        message:
          'Cette demande a déjà été traitée et ne peut plus être modifiée. Contactez notre équipe si nécessaire.',
      };
    }

    const { error } = await supabase.from('releases').update(champs).eq('id', existante.id);
    if (error) {
      console.error('Mise à jour de la sortie :', error.message);
      return { ok: false, message: 'L’enregistrement a échoué. Réessayez dans un instant.' };
    }

    revalidatePath('/espace');
    revalidatePath('/espace/sorties');
    revalidatePath(`/espace/sorties/${existante.id}`);
    return { ok: true, id: existante.id, message: 'Vos modifications ont été enregistrées.' };
  }

  if (!(await aUnAbonnementActif(utilisateur.id))) {
    return {
      ok: false,
      message:
        'Un abonnement actif est nécessaire pour préparer une demande de distribution. Choisissez une formule depuis la section Abonnement : votre demande pourra être créée dès que votre paiement aura été vérifié.',
    };
  }

  const { data, error } = await supabase
    .from('releases')
    .insert({ ...champs, user_id: utilisateur.id })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Création de la sortie :', error?.message);
    return { ok: false, message: 'La demande n’a pas pu être créée. Réessayez dans un instant.' };
  }

  revalidatePath('/espace');
  revalidatePath('/espace/sorties');
  return { ok: true, id: data.id, message: 'Votre demande a été créée.' };
}

/**
 * Enregistre les chemins des fichiers déjà téléversés dans Storage.
 * On vérifie que le chemin appartient bien au dossier de l'utilisateur.
 */
export async function enregistrerFichiers(entree: {
  id: string;
  pochettePath?: string | null;
  audioPath?: string | null;
}): Promise<ResultatSortie> {
  const { utilisateur, supabase } = await contexte();

  const { data: sortie, error } = await supabase
    .from('releases')
    .select('id, statut, user_id')
    .eq('id', entree.id)
    .maybeSingle();

  if (error || !sortie || sortie.user_id !== utilisateur.id) {
    return { ok: false, message: 'Demande introuvable.' };
  }
  if (!STATUTS_MODIFIABLES.includes(sortie.statut)) {
    return { ok: false, message: 'Cette demande ne peut plus être modifiée.' };
  }

  const prefixe = `${utilisateur.id}/${sortie.id}/`;
  const verifier = (chemin: string | null | undefined) =>
    chemin == null || chemin.startsWith(prefixe);

  if (!verifier(entree.pochettePath) || !verifier(entree.audioPath)) {
    return { ok: false, message: 'Fichier non autorisé.' };
  }

  const miseAJour: { pochette_path?: string; audio_path?: string } = {};
  if (typeof entree.pochettePath === 'string') miseAJour.pochette_path = entree.pochettePath;
  if (typeof entree.audioPath === 'string') miseAJour.audio_path = entree.audioPath;
  if (Object.keys(miseAJour).length === 0) return { ok: true, id: sortie.id };

  const { error: erreurMaj } = await supabase
    .from('releases')
    .update(miseAJour)
    .eq('id', sortie.id);

  if (erreurMaj) {
    console.error('Enregistrement des fichiers :', erreurMaj.message);
    return { ok: false, message: 'Les fichiers n’ont pas pu être enregistrés.' };
  }

  revalidatePath(`/espace/sorties/${sortie.id}`);
  return { ok: true, id: sortie.id };
}

/** Vérifie la complétude d'une demande avant l'envoi à la vérification. */
function elementsManquants(sortie: Sortie): string[] {
  const manques: string[] = [];
  if (!sortie.titre || sortie.titre.trim().length < 2) manques.push('le titre');
  if (!sortie.artiste_principal || sortie.artiste_principal.trim().length < 2)
    manques.push('l’artiste principal');
  if (!sortie.auteurs_compositeurs || sortie.auteurs_compositeurs.trim().length < 3)
    manques.push('les auteurs et compositeurs');
  if (!sortie.date_sortie_souhaitee) {
    manques.push('la date de sortie souhaitée');
  } else if (sortie.date_sortie_souhaitee < aujourdHuiIso()) {
    manques.push('une date de sortie à venir');
  }
  if (!sortie.pochette_path) manques.push('la pochette');
  if (!sortie.audio_path) manques.push('le fichier audio');
  if (sortie.type_sortie !== 'single' && (!sortie.liste_titres || sortie.liste_titres.trim().length < 3))
    manques.push('la liste des titres');
  return manques;
}

/** Envoie une demande complète pour vérification par l'équipe. */
export async function soumettreSortie(id: string): Promise<ResultatSortie> {
  const { utilisateur, supabase } = await contexte();

  if (!(await aUnAbonnementActif(utilisateur.id))) {
    return {
      ok: false,
      message:
        'Votre abonnement doit être actif pour envoyer une demande. Rendez-vous dans la section Abonnement.',
    };
  }

  const { data: sortie, error } = await supabase
    .from('releases')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !sortie || sortie.user_id !== utilisateur.id) {
    return { ok: false, message: 'Demande introuvable.' };
  }
  if (!STATUTS_MODIFIABLES.includes(sortie.statut)) {
    return { ok: false, message: 'Cette demande a déjà été envoyée.' };
  }

  const manques = elementsManquants(sortie);
  if (manques.length > 0) {
    return {
      ok: false,
      message: `Il manque encore : ${manques.join(', ')}.`,
    };
  }

  const { error: erreurMaj } = await supabase
    .from('releases')
    .update({ statut: 'en_attente_verification' })
    .eq('id', sortie.id);

  if (erreurMaj) {
    console.error('Soumission de la sortie :', erreurMaj.message);
    return { ok: false, message: 'L’envoi a échoué. Réessayez dans un instant.' };
  }

  revalidatePath('/espace');
  revalidatePath('/espace/sorties');
  revalidatePath(`/espace/sorties/${sortie.id}`);
  return { ok: true, id: sortie.id, message: 'Votre demande a été envoyée pour vérification.' };
}

/** Supprime un brouillon (et ses fichiers). */
export async function supprimerSortie(formData: FormData): Promise<void> {
  const { utilisateur, supabase } = await contexte();
  const id = texte(formData, 'sortie_id');

  const { data: sortie } = await supabase
    .from('releases')
    .select('id, statut, user_id, pochette_path, audio_path')
    .eq('id', id)
    .maybeSingle();

  if (!sortie || sortie.user_id !== utilisateur.id || sortie.statut !== 'brouillon') {
    redirect('/espace/sorties?erreur=suppression');
  }

  if (sortie.pochette_path) {
    await supabase.storage.from('pochettes').remove([sortie.pochette_path]);
  }
  if (sortie.audio_path) {
    await supabase.storage.from('audios').remove([sortie.audio_path]);
  }

  const { error } = await supabase.from('releases').delete().eq('id', sortie.id);
  if (error) {
    console.error('Suppression de la sortie :', error.message);
    redirect('/espace/sorties?erreur=suppression');
  }

  revalidatePath('/espace');
  revalidatePath('/espace/sorties');
  redirect('/espace/sorties?supprime=1');
}
