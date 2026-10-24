'use client';

import { useActionState } from 'react';
import { Check } from 'lucide-react';
import { souscrireFormule } from '@/actions/abonnement';
import { Alerte } from '@/components/ui/alerte';
import { Badge } from '@/components/ui/badge';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { cn } from '@/lib/cn';
import { fcfa, duree } from '@/lib/format';
import { etatInitial } from '@/lib/validation';
import type { FormuleAbonnement } from '@/config/site';

interface Props {
  formules: FormuleAbonnement[];
  /** Message affiché lorsque la souscription est temporairement bloquée. */
  bloque?: string | null;
}

export function ChoixFormule({ formules, bloque }: Props) {
  const [etat, action] = useActionState(souscrireFormule, etatInitial);

  return (
    <form action={action} className="space-y-4">
      <MessageFormulaire etat={etat} />
      {bloque && <Alerte type="info">{bloque}</Alerte>}

      <div className="grid gap-4 md:grid-cols-3">
        {formules.map((formule) => {
          const enAvant = Boolean(formule.misEnAvant);
          return (
            <article
              key={formule.code}
              className={cn(
                'flex flex-col rounded-3xl p-5',
                enAvant
                  ? 'bg-marine-950 text-white shadow-xl shadow-marine-950/20'
                  : 'border border-marine-900/[0.07] bg-white shadow-carte',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={cn(
                    'font-display text-lg font-bold',
                    enAvant ? 'text-white' : 'text-marine-950',
                  )}
                >
                  {formule.nom}
                </h3>
                {formule.badge && (
                  <Badge ton="info" className={enAvant ? 'bg-azur-500/20 text-azur-100 ring-azur-300/30' : ''}>
                    {formule.badge}
                  </Badge>
                )}
              </div>
              <p
                className={cn(
                  'mt-1.5 text-xs leading-relaxed',
                  enAvant ? 'text-marine-300' : 'text-marine-500',
                )}
              >
                {formule.description}
              </p>

              <p className="mt-4">
                <span
                  className={cn(
                    'font-display text-2xl font-extrabold',
                    enAvant ? 'text-white' : 'text-marine-950',
                  )}
                >
                  {fcfa(formule.prixFcfa)}
                </span>
                <span className={cn('ml-1 text-xs', enAvant ? 'text-marine-400' : 'text-marine-500')}>
                  / {duree(formule.dureeJours)}
                </span>
              </p>

              <ul className="mt-4 flex-1 space-y-2">
                {formule.avantages.map((avantage) => (
                  <li key={avantage} className="flex items-start gap-2 text-xs">
                    <Check
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 h-3.5 w-3.5 shrink-0',
                        enAvant ? 'text-emerald-300' : 'text-emerald-600',
                      )}
                    />
                    <span className={enAvant ? 'text-marine-200' : 'text-marine-700'}>{avantage}</span>
                  </li>
                ))}
              </ul>

              <BoutonSoumettre
                name="plan_code"
                value={formule.code}
                variante={enAvant ? 'clair' : 'secondaire'}
                taille="md"
                className="mt-5 w-full"
                disabled={Boolean(bloque)}
                enCours="Sélection…"
              >
                Choisir cette formule
              </BoutonSoumettre>
            </article>
          );
        })}
      </div>
    </form>
  );
}
