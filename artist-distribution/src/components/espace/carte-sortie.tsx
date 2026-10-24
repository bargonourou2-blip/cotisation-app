import Link from 'next/link';
import { ChevronRight, ImageIcon, Music4 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { dateCourte } from '@/lib/format';
import { statutSortie, TYPES_SORTIE } from '@/lib/statuts';
import type { Sortie } from '@/types/database';

interface CarteSortieProps {
  sortie: Sortie;
  pochetteUrl?: string | null;
}

export function CarteSortie({ sortie, pochetteUrl }: CarteSortieProps) {
  const statut = statutSortie(sortie.statut);

  return (
    <Link
      href={`/espace/sorties/${sortie.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-marine-900/[0.06] bg-white p-3.5 shadow-sm transition hover:border-azur-200 hover:shadow-carte"
    >
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-marine-800 via-azur-700 to-azur-400">
        {pochetteUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pochetteUrl}
            alt={`Pochette de ${sortie.titre}`}
            className="h-full w-full object-cover"
          />
        ) : sortie.pochette_path ? (
          <ImageIcon aria-hidden="true" className="h-5 w-5 text-white/80" />
        ) : (
          <Music4 aria-hidden="true" className="h-6 w-6 text-white/90" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-marine-400">
            {TYPES_SORTIE[sortie.type_sortie]}
          </span>
          <Badge ton={statut.ton}>{statut.label}</Badge>
        </div>
        <p className="mt-1 truncate font-semibold text-marine-950">
          {sortie.titre || 'Demande sans titre'}
        </p>
        <p className="truncate text-xs text-marine-500">
          {sortie.artiste_principal || 'Artiste à renseigner'} · modifiée le{' '}
          {dateCourte(sortie.updated_at)}
        </p>
        {sortie.statut === 'informations_a_corriger' && sortie.motif_action && (
          <p className="mt-1.5 line-clamp-2 text-xs font-medium text-amber-700">
            À corriger : {sortie.motif_action}
          </p>
        )}
      </div>

      <ChevronRight
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-marine-300 transition group-hover:translate-x-0.5 group-hover:text-azur-600"
      />
    </Link>
  );
}
