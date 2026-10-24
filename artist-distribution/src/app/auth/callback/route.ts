import { NextResponse, type NextRequest } from 'next/server';
import { creerClientServeur } from '@/lib/supabase/server';
import { supabaseConfigure } from '@/lib/env';
import { cheminInterneSur } from '@/lib/url';

/**
 * Callback d'authentification Supabase.
 * Reçoit le code envoyé par e-mail (confirmation de compte, réinitialisation
 * de mot de passe) et échange ce code contre une session sécurisée.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const erreur = searchParams.get('error');
  const suivant = cheminInterneSur(searchParams.get('suivant'), '/espace');

  if (!supabaseConfigure) {
    return NextResponse.redirect(`${origin}/configuration`);
  }

  if (erreur) {
    return NextResponse.redirect(`${origin}/connexion?erreur=lien`);
  }

  if (code) {
    const supabase = await creerClientServeur();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${suivant}`);
    }
    console.error('Échange du code de connexion :', error.message);
  }

  return NextResponse.redirect(`${origin}/connexion?erreur=lien`);
}
