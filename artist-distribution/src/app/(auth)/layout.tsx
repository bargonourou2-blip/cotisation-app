import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { site } from '@/config/site';

const arguments_ = [
  'Créez votre compte sans avoir de morceau prêt',
  'Choisissez une formule adaptée à votre rythme',
  'Soumettez votre musique quand vous êtes prêt',
];

export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-marine-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(58,145,240,0.3),transparent_60%)]" />
          <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-azur-600/20 blur-[120px]" />
          <div className="absolute inset-0 bg-grille-claire bg-grille opacity-25" />
        </div>

        <div className="relative">
          <Logo variante="clair" taille="lg" />
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-azur-200">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            Espace sécurisé
          </span>
          <p className="mt-6 font-display text-4xl font-extrabold leading-[1.1] text-white">
            Votre musique mérite d’aller plus loin.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-marine-300">
            {site.baseline}
          </p>
          <ul className="mt-8 space-y-3">
            {arguments_.map((argument) => (
              <li key={argument} className="flex items-start gap-3 text-sm text-marine-200">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
                {argument}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-marine-400">
          © {new Date().getFullYear()} {site.legal.raisonSociale} · {site.legal.pays}
        </p>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-marine-100 px-5 py-4 lg:hidden">
          <Logo />
          <Link href="/" className="text-sm font-semibold text-marine-500 hover:text-marine-800">
            Accueil
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[28rem]">{children}</div>
        </main>

        <footer className="px-5 py-6 text-center text-xs text-marine-400">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/conditions-utilisation" className="hover:text-marine-700">
              Conditions d’utilisation
            </Link>
            <Link href="/politique-confidentialite" className="hover:text-marine-700">
              Confidentialité
            </Link>
            <Link href="/" className="hover:text-marine-700">
              Retour à l’accueil
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
