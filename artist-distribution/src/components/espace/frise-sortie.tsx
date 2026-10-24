import { Check, Circle, Clock3, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { dateHeure } from '@/lib/format';
import { ETAPES_SUIVI, etapeActuelle, statutSortie } from '@/lib/statuts';
import type { EvenementSortie, StatutSortie } from '@/types/database';

interface FriseSortieProps {
  statut: StatutSortie;
  evenements?: EvenementSortie[];
  motif?: string | null;
}

export function FriseSortie({ statut, evenements = [], motif }: FriseSortieProps) {
  const courante = etapeActuelle(statut);
  const definition = statutSortie(statut);
  const bloquee = statut === 'informations_a_corriger' || statut === 'refusee';

  return (
    <div>
      {bloquee && motif && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Message de notre équipe</p>
          <p className="mt-1 whitespace-pre-line leading-relaxed">{motif}</p>
        </div>
      )}

      <ol className="space-y-1">
        {ETAPES_SUIVI.map((etape, index) => {
          const faite = courante > index;
          const enCours = courante === index;
          return (
            <li key={etape.statut} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border text-[0.65rem] font-bold',
                    faite && 'border-emerald-500 bg-emerald-500 text-white',
                    enCours && !bloquee && 'border-azur-500 bg-azur-50 text-azur-700 ring-4 ring-azur-100',
                    !faite && !enCours && 'border-marine-200 bg-white text-marine-400',
                    enCours && bloquee && 'border-amber-400 bg-amber-50 text-amber-700 ring-4 ring-amber-100',
                  )}
                >
                  {faite ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
                </span>
                {index < ETAPES_SUIVI.length - 1 && (
                  <span
                    className={cn('my-1 h-6 w-px', faite ? 'bg-emerald-300' : 'bg-marine-200')}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="pb-3 pt-0.5">
                <p
                  className={cn(
                    'text-sm',
                    enCours ? 'font-semibold text-marine-950' : 'font-medium text-marine-700',
                  )}
                >
                  {etape.label}
                </p>
                {enCours && (
                  <p className="mt-0.5 text-xs text-marine-500">
                    {statut === 'informations_a_corriger'
                      ? 'En attente de votre correction'
                      : statut === 'refusee'
                        ? 'Demande non retenue'
                        : definition.label}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {statut === 'brouillon' && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-marine-50 px-3 py-2 text-xs text-marine-600">
          <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
          Votre demande n’a pas encore été envoyée.
        </p>
      )}

      {statut === 'refusee' && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
          Cette demande n’a pas été retenue.
        </p>
      )}

      {evenements.length > 0 && (
        <div className="mt-6 border-t border-marine-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-marine-400">
            Historique
          </h3>
          <ul className="mt-3 space-y-2.5">
            {evenements.map((evenement) => (
              <li key={evenement.id} className="flex items-start gap-2.5 text-xs">
                <Circle aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 fill-marine-300 text-marine-300" />
                <div>
                  <p className="font-medium text-marine-800">
                    {statutSortie(evenement.statut).label}
                  </p>
                  <p className="text-marine-400">{dateHeure(evenement.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
