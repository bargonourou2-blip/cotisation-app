'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { getSupabaseEnv } from '@/lib/env';

/**
 * Client Supabase pour le navigateur.
 * Il ne contient que la clé publique « anon ».
 */
export function creerClientNavigateur() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}

let client: ReturnType<typeof creerClientNavigateur> | null = null;

/** Version mémorisée : évite de recréer un client à chaque rendu. */
export function getClientNavigateur() {
  if (!client) client = creerClientNavigateur();
  return client;
}
