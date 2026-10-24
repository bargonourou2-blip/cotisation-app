import { Check, CreditCard, ShieldCheck, Smartphone } from 'lucide-react';
import { LienBouton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { duree } from '@/lib/format';
import { paiement, site, type FormuleAbonnement } from '@/config/site';

function Prix({ montant, clair }: { montant: number; clair: boolean }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span
        className={cn(
          'font-display text-4xl font-extrabold tracking-tight sm:text-5xl',
          clair ? 'text-white' : 'text-marine-950',
        )}
      >
        {new Intl.NumberFormat('fr-FR').format(montant)}
      </span>
      <span className={cn('text-sm font-semibold', clair ? 'text-marine-300' : 'text-marine-500')}>
        FCFA
      </span>
    </p>
  );
}

export function SectionFormules({ formules }: { formules: FormuleAbonnement[] }) {
  return (
    <section id="formules" className="scroll-mt-24 py-16 sm:py-20 lg:py-24">
      <div className="conteneur">
        <div className="mx-auto max-w-2xl text-center">
          <span className="surtitre">Formules d’abonnement</span>
          <h2 className="titre-section mt-3">Choisissez votre rythme</h2>
          <p className="mt-4 text-base leading-relaxed text-marine-600">
            Toutes les formules donnent accès à votre espace artiste, à la soumission de sorties et
            au suivi de vos demandes. Vous pourrez changer de formule à tout moment en contactant
            notre équipe.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {formules.map((formule) => {
            const enAvant = Boolean(formule.misEnAvant);
            return (
              <article
                key={formule.code}
                className={cn(
                  'relative flex flex-col rounded-3xl p-6 sm:p-7',
                  enAvant
                    ? 'bg-marine-950 text-white shadow-2xl shadow-marine-950/25 ring-1 ring-white/10'
                    : 'border border-marine-900/[0.07] bg-white shadow-carte',
                )}
              >
                {formule.badge && (
                  <div className="mb-4">
                    <Badge ton={enAvant ? 'info' : 'info'} className={enAvant ? 'bg-azur-500/20 text-azur-100 ring-azur-300/30' : ''}>
                      {formule.badge}
                    </Badge>
                  </div>
                )}

                <h3
                  className={cn(
                    'font-display text-xl font-bold',
                    enAvant ? 'text-white' : 'text-marine-950',
                  )}
                >
                  {formule.nom}
                </h3>
                <p
                  className={cn(
                    'mt-1.5 min-h-[2.5rem] text-sm leading-relaxed',
                    enAvant ? 'text-marine-300' : 'text-marine-600',
                  )}
                >
                  {formule.description}
                </p>

                <div className={cn('mt-6 border-t pt-6', enAvant ? 'border-white/10' : 'border-marine-100')}>
                  <Prix montant={formule.prixFcfa} clair={enAvant} />
                  <p className={cn('mt-1 text-sm', enAvant ? 'text-marine-300' : 'text-marine-500')}>
                    pour {duree(formule.dureeJours)}
                  </p>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {formule.avantages.map((avantage) => (
                    <li key={avantage} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                          enAvant ? 'bg-azur-500/25 text-azur-200' : 'bg-emerald-50 text-emerald-600',
                        )}
                      >
                        <Check aria-hidden="true" className="h-3 w-3" />
                      </span>
                      <span className={enAvant ? 'text-marine-100' : 'text-marine-700'}>{avantage}</span>
                    </li>
                  ))}
                </ul>

                <LienBouton
                  href={`/inscription?formule=${encodeURIComponent(formule.code)}`}
                  variante={enAvant ? 'clair' : 'secondaire'}
                  taille="lg"
                  className="mt-8 w-full"
                >
                  Choisir cette formule
                </LienBouton>
              </article>
            );
          })}
        </div>

        {site.tarifsProvisoires && (
          <p className="mt-6 text-center text-xs leading-relaxed text-marine-500">
            Tarifs et durées provisoires, susceptibles d’évoluer avant le lancement officiel. Le
            montant exact de votre abonnement est confirmé avant tout paiement.
          </p>
        )}

        <div className="mt-10 grid gap-4 rounded-3xl border border-marine-900/[0.06] bg-white p-6 sm:grid-cols-3 sm:p-7">
          <div className="flex gap-3">
            <Smartphone aria-hidden="true" className="h-5 w-5 shrink-0 text-azur-600" />
            <div>
              <p className="text-sm font-semibold text-marine-950">Paiement mobile</p>
              <p className="mt-1 text-xs leading-relaxed text-marine-600">
                Orange Money, Moov Money et autres moyens locaux, selon les instructions de notre
                équipe.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-azur-600" />
            <div>
              <p className="text-sm font-semibold text-marine-950">Vérification humaine</p>
              <p className="mt-1 text-xs leading-relaxed text-marine-600">
                Votre abonnement est activé après contrôle du paiement ({paiement.manuel.delaiVerification}).
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <CreditCard aria-hidden="true" className="h-5 w-5 shrink-0 text-azur-600" />
            <div>
              <p className="text-sm font-semibold text-marine-950">
                Paiement en ligne {paiement.enLigne.actif ? 'disponible' : 'non disponible'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-marine-600">
                {paiement.enLigne.actif
                  ? 'Un prestataire sécurisé est configuré pour régler en ligne.'
                  : 'Aucun prestataire n’est encore configuré : le site vous le signale clairement.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
