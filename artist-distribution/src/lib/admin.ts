import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Profil } from '@/types/database';

type Client = SupabaseClient<Database>;

/**
 * Charge les profils correspondant à une liste d'identifiants.
 * L'administrateur a le droit de lire tous les profils (règle RLS).
 */
export async function profilsParIds(
  supabase: Client,
  ids: Array<string | null | undefined>,
): Promise<Map<string, Profil>> {
  const uniques = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const resultat = new Map<string, Profil>();
  if (uniques.length === 0) return resultat;

  const { data, error } = await supabase.from('profiles').select('*').in('id', uniques);
  if (error) {
    console.error('Chargement des profils :', error.message);
    return resultat;
  }
  data?.forEach((profil) => resultat.set(profil.id, profil));
  return resultat;
}
