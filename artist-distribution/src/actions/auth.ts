'use server';

import { redirect } from 'next/navigation';
import { creerClientServeur } from '@/lib/supabase/server';
import { supabaseConfigure } from '@/lib/env';
import { origineSite, cheminInterneSur } from '@/lib/url';
import { getUtilisateur } from '@/lib/auth';
import { messageErreurAuth, MESSAGE_CONFIG_MANQUANTE } from '@/lib/erreurs-auth';
import {
  erreursParChamp,
  etatInitial,
  schemaConnexion,
  schemaEmail,
  schemaInscription,
  schemaNouveauMotDePasse,
  texte,
  type EtatFormulaire,
} from '@/lib/validation';

/**
 * Création de compte.
 * ⚠️ On ne demande AUCUNE information musicale ici : compte et distribution
 *    sont deux étapes distinctes.
 */
export async function inscription(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  if (!supabaseConfigure) {
    return { statut: 'erreur', message: MESSAGE_CONFIG_MANQUANTE };
  }

  const verif = schemaInscription.safeParse({
    nom_complet: texte(formData, 'nom_complet'),
    nom_artiste: texte(formData, 'nom_artiste'),
    email: texte(formData, 'email'),
    telephone: texte(formData, 'telephone'),
    pays: texte(formData, 'pays'),
    type_compte: texte(formData, 'type_compte'),
    mot_de_passe: texte(formData, 'mot_de_passe'),
    confirmation: texte(formData, 'confirmation'),
    conditions: texte(formData, 'conditions'),
  });

  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Merci de vérifier les champs signalés.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const donnees = verif.data;
  const formule = texte(formData, 'formule').slice(0, 40);
  const origine = await origineSite();
  const supabase = await creerClientServeur();

  const { data, error } = await supabase.auth.signUp({
    email: donnees.email,
    password: donnees.mot_de_passe,
    options: {
      emailRedirectTo: `${origine}/auth/callback?suivant=${encodeURIComponent('/espace')}`,
      data: {
        nom_complet: donnees.nom_complet,
        nom_artiste: donnees.nom_artiste,
        telephone: donnees.telephone,
        pays: donnees.pays,
        type_compte: donnees.type_compte,
        formule_souhaitee: formule || null,
      },
    },
  });

  if (error) {
    console.error('Inscription :', error.message);
    const dejaInscrit =
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('already been registered');
    return {
      statut: 'erreur',
      message: messageErreurAuth(error.message),
      erreursChamps: dejaInscrit ? { email: 'Cette adresse est déjà utilisée.' } : undefined,
    };
  }

  // Si la confirmation par e-mail est désactivée dans Supabase, une session
  // est directement créée : on emmène l'artiste dans son espace.
  if (data.session) {
    redirect('/espace?bienvenue=1');
  }

  // Le compte existe mais doit être confirmé (aucune donnée sensible affichée).
  if (data.user?.identities && data.user.identities.length === 0) {
    // Comportement de Supabase pour un e-mail déjà utilisé : on reste neutre.
    redirect(`/verification-email?email=${encodeURIComponent(donnees.email)}`);
  }

  redirect(
    `/verification-email?email=${encodeURIComponent(donnees.email)}${
      formule ? `&formule=${encodeURIComponent(formule)}` : ''
    }`,
  );
}

/** Connexion par e-mail + mot de passe. */
export async function connexion(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  if (!supabaseConfigure) {
    return { statut: 'erreur', message: MESSAGE_CONFIG_MANQUANTE };
  }

  const verif = schemaConnexion.safeParse({
    email: texte(formData, 'email'),
    mot_de_passe: texte(formData, 'mot_de_passe'),
  });

  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Merci de vérifier vos informations.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.signInWithPassword({
    email: verif.data.email,
    password: verif.data.mot_de_passe,
  });

  if (error) {
    console.error('Connexion :', error.message);
    return { statut: 'erreur', message: messageErreurAuth(error.message) };
  }

  const suivant = cheminInterneSur(texte(formData, 'suivant'), '/espace');
  redirect(suivant);
}

/** Déconnexion : supprime la session et les cookies. */
export async function deconnexion(): Promise<void> {
  if (supabaseConfigure) {
    const supabase = await creerClientServeur();
    await supabase.auth.signOut();
  }
  redirect('/');
}

/**
 * Demande de réinitialisation du mot de passe.
 * On répond toujours la même chose pour ne pas révéler si un compte existe.
 */
export async function motDePasseOublie(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  if (!supabaseConfigure) {
    return { statut: 'erreur', message: MESSAGE_CONFIG_MANQUANTE };
  }

  const verif = schemaEmail.safeParse({ email: texte(formData, 'email') });
  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Vérifiez votre adresse e-mail.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const origine = await origineSite();
  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.resetPasswordForEmail(verif.data.email, {
    redirectTo: `${origine}/auth/callback?suivant=${encodeURIComponent('/nouveau-mot-de-passe')}`,
  });

  if (error && error.message.toLowerCase().includes('rate limit')) {
    return { statut: 'erreur', message: messageErreurAuth(error.message) };
  }
  if (error) {
    console.error('Réinitialisation :', error.message);
  }

  return {
    statut: 'succes',
    message:
      'Si un compte est associé à cette adresse, vous recevrez un e-mail avec un lien sécurisé. ' +
      'Pensez à vérifier vos courriers indésirables.',
  };
}

/** Enregistrement du nouveau mot de passe (après le lien reçu par e-mail). */
export async function nouveauMotDePasse(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  if (!supabaseConfigure) {
    return { statut: 'erreur', message: MESSAGE_CONFIG_MANQUANTE };
  }

  const utilisateur = await getUtilisateur();
  if (!utilisateur) {
    redirect('/mot-de-passe-oublie?erreur=expire');
  }

  const verif = schemaNouveauMotDePasse.safeParse({
    mot_de_passe: texte(formData, 'mot_de_passe'),
    confirmation: texte(formData, 'confirmation'),
  });

  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Merci de vérifier les champs signalés.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.updateUser({ password: verif.data.mot_de_passe });

  if (error) {
    console.error('Nouveau mot de passe :', error.message);
    return { statut: 'erreur', message: messageErreurAuth(error.message) };
  }

  redirect('/espace?message=mot-de-passe-modifie');
}

/** Renvoyer l'e-mail de confirmation. */
export async function renvoyerConfirmation(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  if (!supabaseConfigure) {
    return { statut: 'erreur', message: MESSAGE_CONFIG_MANQUANTE };
  }

  const verif = schemaEmail.safeParse({ email: texte(formData, 'email') });
  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Vérifiez votre adresse e-mail.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const origine = await origineSite();
  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: verif.data.email,
    options: { emailRedirectTo: `${origine}/auth/callback?suivant=${encodeURIComponent('/espace')}` },
  });

  if (error) {
    console.error('Renvoi de confirmation :', error.message);
    return {
      statut: 'erreur',
      message: 'Impossible de renvoyer l’e-mail pour le moment. Réessayez plus tard.',
    };
  }

  return {
    statut: 'succes',
    message: 'Un nouvel e-mail de confirmation vient d’être envoyé. Vérifiez votre boîte de réception.',
  };
}
