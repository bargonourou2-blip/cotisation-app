import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, Database, KeyRound, Terminal } from 'lucide-react';
import { supabaseConfigure } from '@/lib/env';
import { Alerte } from '@/components/ui/alerte';
import { LienBouton } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Configuration du service',
  robots: { index: false, follow: false },
};

export default function PageConfiguration() {
  return (
    <div className="conteneur max-w-3xl py-12 sm:py-16">
      <span className="surtitre">Installation</span>
      <h1 className="mt-3 font-display text-3xl font-extrabold text-marine-950">
        Configuration du service
      </h1>

      {supabaseConfigure ? (
        <>
          <div className="mt-6">
            <Alerte type="succes" titre="La connexion à Supabase est configurée">
              Les comptes, la base de données et les fichiers peuvent fonctionner. Vérifiez encore
              les URL de redirection dans Supabase (Authentication → URL Configuration) et testez un
              parcours d’inscription complet.
            </Alerte>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <LienBouton href="/inscription" variante="principal">
              Tester l’inscription
            </LienBouton>
            <LienBouton href="/connexion" variante="secondaire">
              Tester la connexion
            </LienBouton>
          </div>
        </>
      ) : (
        <>
          <div className="mt-6">
            <Alerte type="attention" titre="Supabase n’est pas encore connecté">
              La plateforme fonctionne en mode « vitrine » : le design est visible, mais la création
              de compte, la connexion et l’enregistrement des données sont désactivés. Aucun compte
              ne peut être créé tant que cette étape n’est pas terminée.
            </Alerte>
          </div>

          <ol className="mt-8 space-y-4">
            {[
              {
                icone: Database,
                titre: '1. Créer un projet Supabase',
                texte:
                  'Rendez-vous sur supabase.com, créez un projet, puis ouvrez l’éditeur SQL (SQL Editor).',
              },
              {
                icone: Terminal,
                titre: '2. Exécuter les scripts SQL',
                texte:
                  'Collez le contenu de supabase/migrations/20261024000000_initial.sql, exécutez-le, puis faites de même avec supabase/seed.sql (formules de démarrage).',
              },
              {
                icone: KeyRound,
                titre: '3. Renseigner les variables',
                texte:
                  'Dans Project Settings → API, copiez « Project URL » et la clé publique « anon ». Ajoutez-les dans .env.local (ou dans Vercel → Settings → Environment Variables) sous les noms NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.',
              },
              {
                icone: CheckCircle2,
                titre: '4. Redémarrer et tester',
                texte:
                  'Relancez le serveur (npm run dev) puis testez une inscription. Pour devenir administrateur, exécutez supabase/promouvoir-admin.sql avec votre adresse e-mail.',
              },
            ].map(({ icone: Icone, titre, texte }) => (
              <li key={titre} className="flex gap-3.5 rounded-2xl border border-marine-900/[0.06] bg-white p-4 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-azur-50 text-azur-700">
                  <Icone aria-hidden="true" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-marine-950">{titre}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-marine-600">{texte}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Ne mettez jamais la clé « service_role » dans le code du navigateur ni dans une
              variable préfixée par NEXT_PUBLIC_. Cette application n’en a pas besoin.
            </p>
          </div>

          <p className="mt-6 text-sm text-marine-600">
            Le guide complet (captures d’étapes, déploiement Vercel, e-mails) se trouve dans le
            fichier <code className="rounded bg-marine-100 px-1.5 py-0.5 text-xs">README.md</code> du
            projet.
          </p>
        </>
      )}

      <p className="mt-8 text-sm">
        <Link href="/" className="lien-texte">
          Retour à l’accueil
        </Link>
      </p>
    </div>
  );
}
