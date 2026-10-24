import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Search, UsersRound } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/champs';
import { creerClientServeur } from '@/lib/supabase/server';
import { dateCourte, initiales } from '@/lib/format';
import { abonnementValide, statutAbonnement, statutAbonnementEffectif, TYPES_COMPTE } from '@/lib/statuts';
import type { Abonnement } from '@/types/database';

export const metadata: Metadata = { title: 'Artistes' };

export default async function PageArtistes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const recherche = (params.q ?? '').trim().slice(0, 60).replace(/[,()]/g, ' ');

  const supabase = await creerClientServeur();
  let requete = supabase
    .from('profiles')
    .select('*')
    .eq('role', 'artiste')
    .order('created_at', { ascending: false })
    .limit(100);

  if (recherche) {
    requete = requete.or(
      `nom_complet.ilike.%${recherche}%,nom_artiste.ilike.%${recherche}%,email.ilike.%${recherche}%,telephone.ilike.%${recherche}%`,
    );
  }

  const { data: profilsData, error } = await requete;
  const profils = profilsData ?? [];

  let abonnements: Abonnement[] = [];
  if (profils.length > 0) {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .in(
        'user_id',
        profils.map((element) => element.id),
      )
      .order('created_at', { ascending: false });
    abonnements = data ?? [];
  }

  function abonnementDe(userId: string) {
    const liste = abonnements.filter((element) => element.user_id === userId);
    return liste.find((element) => abonnementValide(element)) ?? liste[0] ?? null;
  }

  return (
    <>
      <EntetePage
        titre="Artistes"
        sousTitre="Consultez les comptes créés sur la plateforme et leur situation."
      />

      <form action="/admin/artistes" method="get" className="mb-5 flex max-w-lg gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-marine-400"
          />
          <Input
            name="q"
            defaultValue={recherche}
            placeholder="Nom, artiste, e-mail ou téléphone"
            className="pl-10"
            aria-label="Rechercher un artiste"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-marine-950 px-4 text-sm font-semibold text-white hover:bg-marine-900"
        >
          Rechercher
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          La recherche a échoué. Réessayez.
        </p>
      )}

      {profils.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-marine-200 bg-white px-6 py-12 text-center">
          <UsersRound aria-hidden="true" className="mx-auto h-6 w-6 text-marine-300" />
          <p className="mt-3 font-semibold text-marine-900">Aucun artiste trouvé</p>
          <p className="mt-1 text-sm text-marine-500">
            {recherche ? 'Essayez avec un autre terme de recherche.' : 'Aucun compte n’a encore été créé.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-marine-900/[0.06] bg-white shadow-carte">
          <ul className="divide-y divide-marine-100">
            {profils.map((profil) => {
              const abonnement = abonnementDe(profil.id);
              const statut = abonnement ? statutAbonnement(statutAbonnementEffectif(abonnement) ?? abonnement.statut) : null;
              return (
                <li key={profil.id}>
                  <Link
                    href={`/admin/artistes/${profil.id}`}
                    className="flex items-center gap-3.5 px-4 py-4 transition hover:bg-marine-50/60 sm:px-5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
                      {initiales(profil.nom_artiste || profil.nom_complet)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-marine-950">
                        {profil.nom_artiste}{' '}
                        <span className="font-normal text-marine-500">· {profil.nom_complet}</span>
                      </p>
                      <p className="truncate text-xs text-marine-500">
                        {profil.email} · {profil.telephone} · {profil.pays}
                      </p>
                      <p className="mt-0.5 text-[0.7rem] text-marine-400">
                        {TYPES_COMPTE[profil.type_compte]} · inscrit le {dateCourte(profil.created_at)}
                      </p>
                    </div>
                    <div className="hidden shrink-0 sm:block">
                      {statut ? (
                        <div className="flex flex-col items-end gap-1">
                          <Badge ton={statut.ton}>{statut.label}</Badge>
                          <span className="text-[0.65rem] text-marine-400">{abonnement?.plan_nom}</span>
                        </div>
                      ) : (
                        <Badge ton="neutre">Sans abonnement</Badge>
                      )}
                    </div>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-marine-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-marine-400">
        {profils.length} compte(s) affiché(s), 100 maximum par recherche.
      </p>
    </>
  );
}
