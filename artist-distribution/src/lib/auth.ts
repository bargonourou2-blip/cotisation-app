import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { creerClientServeur } from '@/lib/supabase/server';
import { supabaseConfigure } from '@/lib/env';
import type { Profil } from '@/types/database';

/**
 * Petites fonctions utilitaires pour savoir qui est connecté.
 * `cache()` évite de refaire la même requête plusieurs fois dans un rendu.
 */

export const getUtilisateur = cache(async (): Promise<User | null> => {
  if (!supabaseConfigure) return null;
  const supabase = await creerClientServeur();
  // getUser() vérifie le jeton auprès du serveur Supabase (plus sûr que getSession()).
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
});

export const getProfil = cache(async (): Promise<Profil | null> => {
  const user = await getUtilisateur();
  if (!user) return null;
  const supabase = await creerClientServeur();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.error('Lecture du profil impossible :', error.message);
    return null;
  }
  return data;
});

/** Redirige vers la page de connexion si l'utilisateur n'est pas connecté. */
export async function exigerUtilisateur(cheminActuel = '/espace'): Promise<User> {
  if (!supabaseConfigure) redirect('/configuration');
  const user = await getUtilisateur();
  if (!user) {
    redirect(`/connexion?suivant=${encodeURIComponent(cheminActuel)}`);
  }
  return user;
}

/** Exige un profil complet (utile après l'inscription). */
export async function exigerProfil(cheminActuel = '/espace'): Promise<Profil> {
  const user = await exigerUtilisateur(cheminActuel);
  const profil = await getProfil();
  if (!profil) {
    // Cas rare : profil absent (création interrompue). On renvoie vers la connexion.
    console.error('Profil introuvable pour', user.id);
    redirect('/connexion?erreur=profil');
  }
  return profil;
}

/**
 * Exige un administrateur. Le contrôle est fait côté serveur, en base,
 * et pas seulement dans l'interface.
 */
export async function exigerAdmin(): Promise<Profil> {
  const profil = await exigerProfil('/admin');
  if (profil.role !== 'admin') {
    redirect('/espace');
  }
  return profil;
}
