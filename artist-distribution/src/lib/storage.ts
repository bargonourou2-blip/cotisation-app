import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type Client = SupabaseClient<Database>;

/** Durée de validité des liens temporaires (en secondes). */
const DUREE_LIEN = 60 * 30;

/** Crée une URL temporaire pour une pochette (bucket privé). */
export async function lienPochette(
  supabase: Client,
  chemin: string | null | undefined,
): Promise<string | null> {
  if (!chemin) return null;
  const { data, error } = await supabase.storage.from('pochettes').createSignedUrl(chemin, DUREE_LIEN);
  if (error) {
    console.error('Lien pochette :', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Crée plusieurs URL de pochettes en une seule requête. */
export async function liensPochettes(
  supabase: Client,
  chemins: string[],
): Promise<Map<string, string>> {
  const resultat = new Map<string, string>();
  const uniques = Array.from(new Set(chemins.filter(Boolean)));
  if (uniques.length === 0) return resultat;

  const { data, error } = await supabase.storage.from('pochettes').createSignedUrls(uniques, DUREE_LIEN);
  if (error) {
    console.error('Liens pochettes :', error.message);
    return resultat;
  }
  data?.forEach((element) => {
    if (element.path && element.signedUrl) resultat.set(element.path, element.signedUrl);
  });
  return resultat;
}

/** Lien temporaire vers le fichier audio (lecture / téléchargement). */
export async function lienAudio(
  supabase: Client,
  chemin: string | null | undefined,
): Promise<string | null> {
  if (!chemin) return null;
  const { data, error } = await supabase.storage.from('audios').createSignedUrl(chemin, DUREE_LIEN);
  if (error) {
    console.error('Lien audio :', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
