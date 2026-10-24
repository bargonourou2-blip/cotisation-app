import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { AnnulerAbonnement } from '@/components/admin/annuler-abonnement';
import { Badge } from '@/components/ui/badge';
import { creerClientServeur } from '@/lib/supabase/server';
import { profilsParIds } from '@/lib/admin';
import { dateCourte, fcfa } from '@/lib/format';
import { statutAbonnement, statutAbonnementEffectif } from '@/lib/statuts';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Abonnements' };

const filtres = [
  { code: 'tous', label: 'Tous' },
  { code: 'actif', label: 'Actifs' },
  { code: 'en_attente_paiement', label: 'En attente' },
  { code: 'expire', label: 'Expirés' },
  { code: 'annule', label: 'Annulés' },
] as const;

type Filtre = (typeof filtres)[number]['code'];

export default async function PageAbonnements({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const params = await searchParams;
  const supabase = await creerClientServeur();
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  const abonnements = data ?? [];
  const profils = await profilsParIds(
    supabase,
    abonnements.map((element) => element.user_id),
  );

  const filtre: Filtre = filtres.some((element) => element.code === params.statut)
    ? (params.statut as Filtre)
    : 'tous';

  const compteurs = {
    tous: abonnements.length,
    actif: abonnements.filter((element) => statutAbonnementEffectif(element) === 'actif').length,
    en_attente_paiement: abonnements.filter((element) => element.statut === 'en_attente_paiement').length,
    expire: abonnements.filter((element) => statutAbonnementEffectif(element) === 'expire').length,
    annule: abonnements.filter((element) => element.statut === 'annule').length,
  };

  const affiches =
    filtre === 'tous'
      ? abonnements
      : abonnements.filter((element) => statutAbonnementEffectif(element) === filtre);

  return (
    <>
      <EntetePage
        titre="Abonnements"
        sousTitre="Historique des souscriptions. Un abonnement n’est actif qu’après confirmation d’un paiement."
        action={
          <Link
            href="/admin/paiements"
            className="inline-flex items-center gap-2 rounded-xl border border-marine-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-marine-700 shadow-sm hover:bg-marine-50"
          >
            <CreditCard aria-hidden="true" className="h-4 w-4" />
            Vérifier les paiements
          </Link>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1 defilement-doux">
        {filtres.map((element) => (
          <Link
            key={element.code}
            href={element.code === 'tous' ? '/admin/abonnements' : `/admin/abonnements?statut=${element.code}`}
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

      <div className="mt-4 space-y-3">
        {affiches.length === 0 ? (
          <p className="rounded-2xl border border-marine-900/[0.06] bg-white px-4 py-6 text-sm text-marine-500 shadow-sm">
            Aucun abonnement dans cette catégorie.
          </p>
        ) : (
          affiches.map((element) => {
            const profil = profils.get(element.user_id);
            const statutEffectif = statutAbonnementEffectif(element);
            const definition = statutAbonnement(statutEffectif ?? element.statut);
            return (
              <article
                key={element.id}
                className="rounded-2xl border border-marine-900/[0.06] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/artistes/${element.user_id}`}
                      className="font-semibold text-marine-950 hover:text-azur-700 hover:underline"
                    >
                      {profil?.nom_artiste ?? 'Artiste inconnu'}
                    </Link>
                    <p className="truncate text-xs text-marine-500">
                      {profil?.nom_complet} · {profil?.email}
                    </p>
                  </div>
                  <Badge ton={definition.ton}>{definition.label}</Badge>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs text-marine-400">Formule</dt>
                    <dd className="font-medium text-marine-900">
                      {element.plan_nom} ({element.duree_jours} j)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-marine-400">Montant</dt>
                    <dd className="font-medium text-marine-900">{fcfa(element.prix_fcfa)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-marine-400">Période</dt>
                    <dd className="font-medium text-marine-900">
                      {dateCourte(element.debut)} → {dateCourte(element.fin)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-marine-400">Souscrit le</dt>
                    <dd className="font-medium text-marine-900">{dateCourte(element.created_at)}</dd>
                  </div>
                </dl>

                {element.statut !== 'annule' && (
                  <div className="mt-2">
                    <AnnulerAbonnement abonnementId={element.id} />
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </>
  );
}
