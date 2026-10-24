import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Disc3 } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { Badge } from '@/components/ui/badge';
import { creerClientServeur } from '@/lib/supabase/server';
import { profilsParIds } from '@/lib/admin';
import { dateCourte } from '@/lib/format';
import { statutSortie, TYPES_SORTIE } from '@/lib/statuts';
import { cn } from '@/lib/cn';
import type { StatutSortie } from '@/types/database';

export const metadata: Metadata = { title: 'Demandes de distribution' };

const filtres = [
  { code: 'toutes', label: 'Toutes' },
  { code: 'a_traiter', label: 'À traiter' },
  { code: 'en_cours', label: 'En cours' },
  { code: 'terminees', label: 'Terminées' },
  { code: 'brouillons', label: 'Brouillons' },
] as const;

type Filtre = (typeof filtres)[number]['code'];

const groupes: Record<Exclude<Filtre, 'toutes'>, StatutSortie[]> = {
  a_traiter: ['en_attente_verification', 'informations_a_corriger'],
  en_cours: ['validee', 'en_preparation', 'envoyee_plateformes'],
  terminees: ['publiee', 'refusee'],
  brouillons: ['brouillon'],
};

export default async function PageSortiesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  const params = await searchParams;
  const supabase = await creerClientServeur();

  const { data } = await supabase
    .from('releases')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(300);

  const sorties = data ?? [];
  const profils = await profilsParIds(
    supabase,
    sorties.map((element) => element.user_id),
  );

  const filtre: Filtre = filtres.some((element) => element.code === params.filtre)
    ? (params.filtre as Filtre)
    : 'toutes';

  const compteurs = Object.fromEntries(
    filtres.map((element) => [
      element.code,
      element.code === 'toutes'
        ? sorties.length
        : sorties.filter((sortie) => groupes[element.code as Exclude<Filtre, 'toutes'>].includes(sortie.statut)).length,
    ]),
  ) as Record<Filtre, number>;

  const affichees =
    filtre === 'toutes' ? sorties : sorties.filter((element) => groupes[filtre].includes(element.statut));

  return (
    <>
      <EntetePage
        titre="Demandes de distribution"
        sousTitre="Vérifiez les informations, échangez avec l’artiste et suivez chaque sortie."
      />

      <div className="flex gap-2 overflow-x-auto pb-1 defilement-doux">
        {filtres.map((element) => (
          <Link
            key={element.code}
            href={element.code === 'toutes' ? '/admin/sorties' : `/admin/sorties?filtre=${element.code}`}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium',
              filtre === element.code
                ? 'border-marine-950 bg-marine-950 text-white'
                : 'border-marine-200 bg-white text-marine-600 hover:border-marine-300',
            )}
          >
            {element.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold',
                filtre === element.code ? 'bg-white/15 text-white' : 'bg-marine-100 text-marine-600',
              )}
            >
              {compteurs[element.code]}
            </span>
          </Link>
        ))}
      </div>

      {affichees.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-marine-200 bg-white px-6 py-12 text-center">
          <Disc3 aria-hidden="true" className="mx-auto h-6 w-6 text-marine-300" />
          <p className="mt-3 font-semibold text-marine-900">Aucune demande dans cette catégorie</p>
          <p className="mt-1 text-sm text-marine-500">Changez de filtre pour voir les autres demandes.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-3xl border border-marine-900/[0.06] bg-white shadow-carte">
          <ul className="divide-y divide-marine-100">
            {affichees.map((element) => {
              const profil = profils.get(element.user_id);
              const definition = statutSortie(element.statut);
              return (
                <li key={element.id}>
                  <Link
                    href={`/admin/sorties/${element.id}`}
                    className="flex items-center gap-3 px-4 py-4 transition hover:bg-marine-50/60 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-marine-950">
                        {element.titre || 'Demande sans titre'}
                      </p>
                      <p className="truncate text-xs text-marine-500">
                        {profil?.nom_artiste ?? 'Artiste'} · {TYPES_SORTIE[element.type_sortie]} ·{' '}
                        {element.soumis_le ? `soumise le ${dateCourte(element.soumis_le)}` : 'brouillon'}
                      </p>
                    </div>
                    <div className="hidden shrink-0 sm:block">
                      <Badge ton={definition.ton}>{definition.label}</Badge>
                    </div>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-marine-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-marine-400">{sorties.length} demande(s) affichée(s), 300 maximum.</p>
    </>
  );
}
