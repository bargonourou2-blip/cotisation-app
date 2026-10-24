import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { getSupabaseEnv } from '@/lib/env';

/**
 * Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
 * La session est stockée dans des cookies httpOnly gérés par Supabase.
 *
 * Créez TOUJOURS un nouveau client par requête : ne le mettez pas en cache.
 */
export async function creerClientServeur() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Les Server Components ne peuvent pas écrire de cookies.
          // Le middleware s'en charge ; ce silence est donc attendu.
        }
      },
    },
  });
}
