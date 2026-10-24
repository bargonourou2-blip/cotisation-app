import { ArrowRight, Music2 } from 'lucide-react';
import { LienBouton } from '@/components/ui/button';

export function CtaFinal() {
  return (
    <section className="py-16 sm:py-20">
      <div className="conteneur">
        <div className="relative overflow-hidden rounded-[2rem] bg-marine-950 px-6 py-12 text-white sm:px-12 sm:py-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-azur-500/30 blur-[100px]" />
            <div className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-sable-400/15 blur-[100px]" />
            <div className="absolute inset-0 bg-grille-claire bg-grille opacity-20" />
          </div>

          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-azur-200">
                <Music2 aria-hidden="true" className="h-3.5 w-3.5" />
                Votre projet commence aujourd’hui
              </span>
              <h2 className="mt-5 max-w-2xl font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Créez votre compte maintenant, envoyez votre musique quand elle sera prête.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-marine-300 sm:text-base">
                Un espace clair, un suivi sérieux et une équipe disponible. Aucun engagement
                technique de votre côté.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
              <LienBouton href="/inscription" variante="principal" taille="lg" className="group">
                Créer mon compte
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </LienBouton>
              <LienBouton
                href="/connexion"
                variante="fantome"
                taille="lg"
                className="border border-white/20 text-white hover:bg-white/10"
              >
                J’ai déjà un compte
              </LienBouton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
