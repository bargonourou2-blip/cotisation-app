/**
 * Lecture des variables d'environnement.
 *
 * ⚠️ Seules les variables préfixées par NEXT_PUBLIC_ sont visibles dans le
 * navigateur. La clé « anon » de Supabase est conçue pour être publique :
 * la sécurité réelle repose sur les règles RLS de la base.
 * Ne mettez JAMAIS la clé « service_role » ici.
 */

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/** Vrai si Supabase est configuré (les deux variables sont présentes et valides). */
export const supabaseConfigure = url.startsWith('https://') && anonKey.length > 20;

/** URL publique du site (utilisée dans les e-mails de confirmation). */
export const siteUrl =
  (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:3000';

export function getSupabaseEnv(): { url: string; anonKey: string } {
  if (!supabaseConfigure) {
    throw new Error(
      'Supabase n’est pas configuré. Renseignez NEXT_PUBLIC_SUPABASE_URL et ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY dans votre fichier .env.local (voir README).',
    );
  }
  return { url, anonKey };
}

/** Domaine Supabase, utilisé par la politique de sécurité du contenu. */
export function supabaseOrigine(): string {
  if (!supabaseConfigure) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}
