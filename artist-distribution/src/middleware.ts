import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseConfigure, getSupabaseEnv, supabaseOrigine } from '@/lib/env';

/**
 * Middleware exécuté avant chaque page :
 *  - rafraîchit la session Supabase (cookies) ;
 *  - protège les pages privées (/espace, /admin…) ;
 *  - ajoute les en-têtes de sécurité (dont la CSP).
 */

const PREFIXES_PRIVES = ['/espace', '/admin', '/nouveau-mot-de-passe'];
const PAGES_CONNEXION = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/verification-email'];

function estCheminPrive(chemin: string) {
  return PREFIXES_PRIVES.some((prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`));
}

function estPageDeConnexion(chemin: string) {
  return PAGES_CONNEXION.some((page) => chemin === page || chemin.startsWith(`${page}/`));
}

function politiqueSecurite(): string {
  const estDev = process.env.NODE_ENV !== 'production';
  const origine = supabaseOrigine();
  const supabaseWs = origine ? origine.replace('https://', 'wss://') : '';
  const scriptDev = estDev ? " 'unsafe-eval'" : '';
  // Autorise l'aperçu intégré de l'environnement de développement (iframe).
  const cadre = estDev
    ? "frame-ancestors 'self' https://*.e2b.app https://*.e2b.dev"
    : "frame-ancestors 'none'";

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${scriptDev}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${origine ? ` ${origine}` : ''}`,
    `media-src 'self' blob:${origine ? ` ${origine}` : ''}`,
    "font-src 'self' data:",
    `connect-src 'self'${origine ? ` ${origine} ${supabaseWs}` : ''}${estDev ? ' ws: wss: http://localhost:*' : ''}`,
    cadre,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(estDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

function appliquerEntetes(response: NextResponse): NextResponse {
  response.headers.set('Content-Security-Policy', politiqueSecurite());
  response.headers.set('X-Content-Type-Options', 'nosniff');
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('X-Frame-Options', 'DENY');
  }
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(), payment=()',
  );
  return response;
}

export async function middleware(request: NextRequest) {
  const chemin = request.nextUrl.pathname;

  // Les pages publiques n'ont pas besoin d'appeler Supabase à chaque visite.
  const besoinSession = estCheminPrive(chemin) || estPageDeConnexion(chemin);

  // Aucun espace privé ne doit s'afficher tant que la base n'est pas branchée.
  if (!supabaseConfigure && estCheminPrive(chemin)) {
    return appliquerEntetes(NextResponse.redirect(new URL('/configuration', request.url)));
  }

  if (!supabaseConfigure || !besoinSession) {
    return appliquerEntetes(NextResponse.next({ request }));
  }

  const { url, anonKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() valide le jeton et rafraîchit la session si nécessaire.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rediriger = (destination: string) => {
    const cible = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => cible.cookies.set(cookie));
    return appliquerEntetes(cible);
  };

  if (estCheminPrive(chemin) && !user) {
    const suivant = `${chemin}${request.nextUrl.search}`;
    return rediriger(`/connexion?suivant=${encodeURIComponent(suivant)}`);
  }

  if (estPageDeConnexion(chemin) && user) {
    return rediriger('/espace');
  }

  return appliquerEntetes(response);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf :
     *  - fichiers statiques Next.js
     *  - images et polices
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
};
