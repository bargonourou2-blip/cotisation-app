import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { supabaseConfigure, getSupabaseEnv } from '@/lib/env';
import { formulesParDefaut, type FormuleAbonnement } from '@/config/site';

function versFormule(ligne: Database['public']['Tables']['subscription_plans']['Row']): FormuleAbonnement {
  return {
    code: ligne.code,
    nom: ligne.nom,
    description: ligne.description,
    prixFcfa: ligne.prix_fcfa,
    dureeJours: ligne.duree_jours,
    avantages: ligne.avantages ?? [],
    misEnAvant: ligne.mis_en_avant,
    badge: ligne.badge,
    actif: ligne.actif,
    ordre: ligne.ordre,
  };
}

/**
 * Formules affichées sur le site public.
 * - Si Supabase est configuré, on lit la base (source de vérité).
 * - Sinon, on utilise les valeurs de `src/config/site.ts`.
 */
export async function getFormulesPubliques(): Promise<FormuleAbonnement[]> {
  const secours = [...formulesParDefaut]
    .filter((formule) => formule.actif)
    .sort((a, b) => a.ordre - b.ordre);

  if (!supabaseConfigure) return secours;

  try {
    const { url, anonKey } = getSupabaseEnv();
    const supabase = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('actif', true)
      .order('ordre', { ascending: true });

    if (error) {
      console.error('Lecture des formules impossible :', error.message);
      return secours;
    }
    if (!data || data.length === 0) return secours;
    return data.map(versFormule);
  } catch (erreur) {
    console.error('Lecture des formules impossible :', erreur);
    return secours;
  }
}

export function formulesDeSecours() {
  return [...formulesParDefaut].filter((formule) => formule.actif).sort((a, b) => a.ordre - b.ordre);
}
