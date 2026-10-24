import { headers } from 'next/headers';
import { siteUrl } from '@/lib/env';

/**
 * Renvoie l'adresse publique du site.
 * En production, `NEXT_PUBLIC_SITE_URL` doit être définie (ex. https://mon-site.vercel.app).
 * Sinon on déduit l'adresse depuis la requête, ce qui fonctionne sur Vercel
 * (y compris pour les aperçus de déploiement).
 */
export async function origineSite(): Promise<string> {
  if (siteUrl && !siteUrl.includes('localhost')) return siteUrl;
  try {
    const entetes = await headers();
    const hote = entetes.get('x-forwarded-host') ?? entetes.get('host');
    if (!hote) return siteUrl;
    const protocole = entetes.get('x-forwarded-proto') ?? (hote.includes('localhost') ? 'http' : 'https');
    return `${protocole}://${hote}`;
  } catch {
    return siteUrl;
  }
}

/**
 * N'accepte que des chemins internes pour éviter les redirections ouvertes
 * (open redirect), une faille classique.
 */
export function cheminInterneSur(valeur: string | null | undefined, defaut = '/espace'): string {
  if (!valeur) return defaut;
  if (!valeur.startsWith('/') || valeur.startsWith('//') || valeur.includes('\\')) return defaut;
  return valeur;
}
