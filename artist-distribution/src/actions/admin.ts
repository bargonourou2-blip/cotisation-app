'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { creerClientServeur } from '@/lib/supabase/server';
import { exigerAdmin } from '@/lib/auth';
import {
  erreursParChamp,
  etatInitial,
  lignesEnTableau,
  schemaFormule,
  schemaStatutSortie,
  texte,
  type EtatFormulaire,
} from '@/lib/validation';

/**
 * Toutes les actions admin vérifient le rôle côté serveur (`exigerAdmin`)
 * ET la base applique elle-même le contrôle via `public.est_admin()`.
 * L'affichage des boutons ne constitue jamais une protection.
 */

function messageAdmin(brut: string): string {
  const texteErreur = brut.toLowerCase();
  if (texteErreur.includes('réservée aux administrateurs')) return 'Action non autorisée.';
  if (texteErreur.includes('déjà été traité')) return 'Cet élément a déjà été traité.';
  if (texteErreur.includes('motif') || texteErreur.includes('corrections'))
    return 'Indiquez les corrections demandées à l’artiste.';
  if (texteErreur.includes('duplicate') || texteErreur.includes('unique'))
    return 'Ce code de formule est déjà utilisé. Choisissez-en un autre.';
  return 'L’opération a échoué. Réessayez dans un instant.';
}

function rafraichirAdmin() {
  revalidatePath('/admin');
  revalidatePath('/admin/paiements');
  revalidatePath('/admin/abonnements');
  revalidatePath('/admin/artistes');
  revalidatePath('/admin/sorties');
  revalidatePath('/espace');
}

/** Confirme un paiement et active l'abonnement (fonction SQL protégée). */
export async function confirmerPaiement(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerAdmin();

  const paymentId = texte(formData, 'payment_id');
  const note = texte(formData, 'note');

  if (!paymentId) return { statut: 'erreur', message: 'Paiement introuvable.' };

  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('admin_confirmer_paiement', {
    p_payment_id: paymentId,
    p_note: note || null,
  });

  if (error) {
    console.error('Confirmation du paiement :', error.message);
    return { statut: 'erreur', message: messageAdmin(error.message) };
  }

  rafraichirAdmin();
  return {
    statut: 'succes',
    message: 'Paiement confirmé. L’abonnement de l’artiste est maintenant actif.',
  };
}

/** Rejette un paiement (motif obligatoire). */
export async function rejeterPaiement(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerAdmin();

  const paymentId = texte(formData, 'payment_id');
  const note = texte(formData, 'note');

  if (!paymentId) return { statut: 'erreur', message: 'Paiement introuvable.' };
  if (note.length < 3) {
    return {
      statut: 'erreur',
      message: 'Indiquez le motif du rejet.',
      erreursChamps: { note: 'Le motif est obligatoire (3 caractères minimum).' },
    };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('admin_rejeter_paiement', {
    p_payment_id: paymentId,
    p_note: note,
  });

  if (error) {
    console.error('Rejet du paiement :', error.message);
    return { statut: 'erreur', message: messageAdmin(error.message) };
  }

  rafraichirAdmin();
  return { statut: 'succes', message: 'Le paiement a été rejeté. L’artiste verra le motif.' };
}

/** Annule un abonnement. */
export async function annulerAbonnement(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerAdmin();

  const abonnementId = texte(formData, 'abonnement_id');
  const note = texte(formData, 'note');
  if (!abonnementId) return { statut: 'erreur', message: 'Abonnement introuvable.' };

  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('admin_annuler_abonnement', {
    p_subscription_id: abonnementId,
    p_note: note || null,
  });

  if (error) {
    console.error('Annulation de l’abonnement :', error.message);
    return { statut: 'erreur', message: messageAdmin(error.message) };
  }

  rafraichirAdmin();
  return { statut: 'succes', message: 'L’abonnement a été annulé.' };
}

/** Met à jour le statut d'une demande de distribution. */
export async function changerStatutSortie(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerAdmin();

  const sortieId = texte(formData, 'sortie_id');
  const verif = schemaStatutSortie.safeParse({
    statut: texte(formData, 'statut'),
    commentaire: texte(formData, 'commentaire'),
  });

  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Vérifiez le statut et le commentaire.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('admin_statut_sortie', {
    p_release_id: sortieId,
    p_statut: verif.data.statut,
    p_commentaire: verif.data.commentaire || null,
  });

  if (error) {
    console.error('Changement de statut :', error.message);
    return { statut: 'erreur', message: messageAdmin(error.message) };
  }

  revalidatePath('/admin/sorties');
  revalidatePath(`/admin/sorties/${sortieId}`);
  revalidatePath('/espace/sorties');
  revalidatePath(`/espace/sorties/${sortieId}`);
  revalidatePath('/espace');
  return { statut: 'succes', message: 'Le statut de la demande a été mis à jour.' };
}

/** Crée ou modifie une formule d'abonnement. */
export async function enregistrerFormule(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerAdmin();

  const id = texte(formData, 'id');
  const verif = schemaFormule.safeParse({
    code: texte(formData, 'code'),
    nom: texte(formData, 'nom'),
    description: texte(formData, 'description'),
    prix_fcfa: texte(formData, 'prix_fcfa'),
    duree_jours: texte(formData, 'duree_jours'),
    avantages: texte(formData, 'avantages'),
    badge: texte(formData, 'badge'),
    mis_en_avant: texte(formData, 'mis_en_avant') || 'non',
    actif: texte(formData, 'actif') || 'oui',
    ordre: texte(formData, 'ordre') || '0',
  });

  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Merci de vérifier les champs signalés.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const donnees = verif.data;
  const valeurs = {
    nom: donnees.nom,
    description: donnees.description,
    prix_fcfa: donnees.prix_fcfa,
    duree_jours: donnees.duree_jours,
    avantages: lignesEnTableau(donnees.avantages),
    badge: donnees.badge || null,
    mis_en_avant: donnees.mis_en_avant === 'oui',
    actif: donnees.actif === 'oui',
    ordre: donnees.ordre,
  };

  const supabase = await creerClientServeur();

  if (id) {
    // Le code d'une formule existante n'est jamais modifié.
    const { error } = await supabase.from('subscription_plans').update(valeurs).eq('id', id);
    if (error) {
      console.error('Mise à jour de la formule :', error.message);
      return { statut: 'erreur', message: messageAdmin(error.message) };
    }
  } else {
    const { error } = await supabase
      .from('subscription_plans')
      .insert({ ...valeurs, code: donnees.code });
    if (error) {
      console.error('Création de la formule :', error.message);
      return { statut: 'erreur', message: messageAdmin(error.message) };
    }
  }

  revalidatePath('/');
  revalidatePath('/admin/formules');
  revalidatePath('/espace/abonnement');
  redirect('/admin/formules?enregistre=1');
}

/** Active ou désactive une formule sans la supprimer. */
export async function basculerActivationFormule(formData: FormData): Promise<void> {
  await exigerAdmin();
  const id = texte(formData, 'id');
  const actif = texte(formData, 'actif') === 'oui';

  const supabase = await creerClientServeur();
  const { error } = await supabase.from('subscription_plans').update({ actif }).eq('id', id);
  if (error) console.error('Activation de la formule :', error.message);

  revalidatePath('/');
  revalidatePath('/admin/formules');
  revalidatePath('/espace/abonnement');
  redirect('/admin/formules?enregistre=1');
}
