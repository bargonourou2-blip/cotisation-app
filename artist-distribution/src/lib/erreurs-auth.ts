/**
 * Traduit les messages techniques de Supabase en messages compréhensibles.
 * On ne montre jamais de détail technique à l'utilisateur.
 */
export function messageErreurAuth(message: string): string {
  const texte = (message ?? '').toLowerCase();

  if (texte.includes('invalid login credentials')) {
    return 'E-mail ou mot de passe incorrect.';
  }
  if (texte.includes('email not confirmed')) {
    return 'Votre adresse e-mail n’a pas encore été confirmée. Consultez votre boîte de réception.';
  }
  if (texte.includes('user already registered') || texte.includes('already been registered')) {
    return 'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.';
  }
  if (texte.includes('rate limit') || texte.includes('too many')) {
    return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
  }
  if (texte.includes('password should be') || texte.includes('weak password')) {
    return 'Ce mot de passe est trop faible. Utilisez au moins 8 caractères avec une lettre et un chiffre.';
  }
  if (texte.includes('invalid email')) {
    return 'Cette adresse e-mail n’est pas valide.';
  }
  if (texte.includes('signup is disabled') || texte.includes('signups not allowed')) {
    return 'Les inscriptions sont temporairement désactivées. Contactez-nous si le problème persiste.';
  }
  if (texte.includes('email link is invalid') || texte.includes('token has expired')) {
    return 'Ce lien a expiré ou n’est plus valide. Demandez un nouveau lien.';
  }

  return 'Une erreur est survenue. Réessayez dans un instant.';
}

export const MESSAGE_CONFIG_MANQUANTE =
  'Le service n’est pas encore activé : la base de données Supabase n’est pas configurée. ' +
  'Consultez le guide d’installation (README) ou contactez l’administrateur du site.';
