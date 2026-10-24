import { ArrowRight, BadgeCheck, Check, Music4, Sparkles, UploadCloud } from 'lucide-react';
import { LienBouton } from '@/components/ui/button';
import { site } from '@/config/site';

const pointsForts = [
  'Inscription possible sans morceau prêt',
  'Paiement Mobile Money vérifié par notre équipe',
  'Suivi de chaque demande, étape par étape',
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-marine-950 text-white">
      {/* Décor */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(58,145,240,0.28),transparent_55%)]" />
        <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-azur-600/20 blur-[120px]" />
        <div className="absolute inset-0 bg-grille-claire bg-grille opacity-[0.35] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-marine-950 to-transparent" />
      </div>

      <div className="conteneur relative grid items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-24">
        <div className="animate-montee-douce">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-azur-200 backdrop-blur">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            Distribution musicale numérique · Burkina Faso et Afrique de l’Ouest
          </span>

          <h1 className="mt-6 font-display text-[2.4rem] font-extrabold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-[3.6rem]">
            Votre musique mérite d’aller <span className="degrade-texte">plus loin</span>.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-marine-200 sm:text-lg">
            Inscrivez-vous, choisissez votre formule et préparez votre première sortie{' '}
            <span className="font-semibold text-white">quand vous serez prêt</span>. Aucun fichier
            audio ni détail de morceau n’est demandé à l’inscription.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <LienBouton href="/inscription" variante="principal" taille="lg" className="group">
              Commencer maintenant
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </LienBouton>
            <LienBouton
              href="/#formules"
              variante="fantome"
              taille="lg"
              className="border border-white/20 text-white hover:bg-white/10"
            >
              Découvrir les formules
            </LienBouton>
          </div>

          <ul className="mt-9 grid gap-3 text-sm text-marine-200 sm:grid-cols-1">
            {pointsForts.map((point) => (
              <li key={point} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Aperçu de l'espace artiste (illustration, aucune donnée réelle) */}
        <div className="relative animate-fondu lg:pl-4">
          <div
            aria-hidden="true"
            className="absolute -inset-8 rounded-[3rem] bg-gradient-to-tr from-azur-500/25 via-azur-400/10 to-sable-400/20 blur-3xl"
          />
          <div className="relative rounded-[2rem] border border-white/15 bg-white/[0.07] p-2.5 shadow-2xl backdrop-blur-sm">
            <div className="rounded-[1.6rem] bg-[#f7f9fd] p-4 text-marine-900 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-azur-500 to-marine-800 text-xs font-bold text-white">
                    AD
                  </span>
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-wider text-marine-400">Espace artiste</p>
                    <p className="text-sm font-semibold text-marine-950">Aperçu du tableau de bord</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <BadgeCheck aria-hidden="true" className="h-3 w-3" />
                  Compte actif
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-marine-900/[0.06] bg-white p-3.5 shadow-sm">
                <div className="flex gap-3">
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-marine-800 via-azur-700 to-azur-400">
                    <Music4 aria-hidden="true" className="h-6 w-6 text-white/90" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-azur-600">
                      Ma demande de distribution
                    </p>
                    <p className="truncate text-sm font-bold text-marine-950">Votre prochaine sortie</p>
                    <p className="mt-1 text-xs text-marine-500">Single · En préparation</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  {[
                    { label: 'Réception', fait: true },
                    { label: 'Validation', fait: true },
                    { label: 'Préparation', fait: true, actif: true },
                    { label: 'Envoi aux plateformes', fait: false },
                    { label: 'Publication', fait: false },
                  ].map((etape) => (
                    <div key={etape.label} className="flex items-center gap-2.5">
                      <span
                        className={
                          etape.fait
                            ? 'flex h-4 w-4 items-center justify-center rounded-full bg-azur-600 text-white'
                            : 'h-4 w-4 rounded-full border border-marine-200 bg-white'
                        }
                      >
                        {etape.fait && <Check aria-hidden="true" className="h-2.5 w-2.5" />}
                      </span>
                      <span
                        className={
                          etape.actif
                            ? 'text-xs font-semibold text-marine-950'
                            : 'text-xs text-marine-500'
                        }
                      >
                        {etape.label}
                      </span>
                      {etape.actif && (
                        <span className="ml-auto rounded-full bg-azur-50 px-2 py-0.5 text-[0.6rem] font-semibold text-azur-700">
                          en cours
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-marine-200 bg-white/60 px-3 py-2.5 text-[0.7rem] text-marine-500">
                <UploadCloud aria-hidden="true" className="h-3.5 w-3.5 text-azur-600" />
                Ajoutez vos fichiers seulement quand votre morceau est prêt.
              </div>
            </div>
          </div>

          <div className="absolute -bottom-5 -left-2 hidden rounded-2xl border border-white/10 bg-marine-900/90 px-4 py-3 text-xs text-white shadow-xl backdrop-blur sm:block">
            <p className="font-semibold">Abonnement suivi par notre équipe</p>
            <p className="mt-0.5 text-[0.7rem] text-marine-300">
              Activation après vérification du paiement
            </p>
          </div>
        </div>
      </div>

      <p className="conteneur relative pb-8 text-center text-xs text-marine-400 sm:text-left">
        Illustration de l’interface · {site.nom}
      </p>
    </section>
  );
}
