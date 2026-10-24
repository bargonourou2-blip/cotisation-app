import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CreditCard,
  Disc3,
  Layers,
  ShieldCheck,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { Badge } from '@/components/ui/badge';
import { creerClientServeur } from '@/lib/supabase/server';
import { profilsParIds } from '@/lib/admin';
import { dateHeure, fcfa } from '@/lib/format';
import { MOYENS_PAIEMENT, statutPaiement, statutSortie } from '@/lib/statuts';

export const metadata: Metadata = { title: 'Vue d’ensemble' };

const libellesActions: Record<string, string> = {
  'abonnement.demande': 'Demande d’abonnement',
  'abonnement.annule': 'Abonnement annulé',
  'paiement.confirme': 'Paiement confirmé',
  'paiement.rejete': 'Paiement rejeté',
  'sortie.statut': 'Statut de demande modifié',
};

export default async function PageAdmin() {
  const supabase = await creerClientServeur();
  const maintenant = new Date().toISOString();

  const [
    { count: nbArtistes },
    { count: nbAbonnementsActifs },
    { count: nbPaiementsAVerifier },
    { count: nbDemandesATraiter },
    { data: paiements },
    { data: sorties },
    { data: journal },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'artiste'),
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'actif')
      .gt('fin', maintenant),
    supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'a_verifier'),
    supabase
      .from('releases')
      .select('*', { count: 'exact', head: true })
      .in('statut', ['en_attente_verification', 'informations_a_corriger']),
    supabase
      .from('payments')
      .select('*')
      .eq('statut', 'a_verifier')
      .order('created_at', { ascending: true })
      .limit(5),
    supabase
      .from('releases')
      .select('*')
      .in('statut', ['en_attente_verification', 'informations_a_corriger'])
      .order('updated_at', { ascending: true })
      .limit(5),
    supabase.from('admin_actions').select('*').order('created_at', { ascending: false }).limit(8),
  ]);

  const profils = await profilsParIds(supabase, [
    ...(paiements ?? []).map((element) => element.user_id),
    ...(sorties ?? []).map((element) => element.user_id),
  ]);

  const statistiques = [
    {
      label: 'Artistes inscrits',
      valeur: nbArtistes ?? 0,
      icone: UsersRound,
      href: '/admin/artistes',
      detail: 'Comptes créés',
    },
    {
      label: 'Abonnements actifs',
      valeur: nbAbonnementsActifs ?? 0,
      icone: CreditCard,
      href: '/admin/abonnements',
      detail: 'En cours de validité',
    },
    {
      label: 'Paiements à vérifier',
      valeur: nbPaiementsAVerifier ?? 0,
      icone: Wallet,
      href: '/admin/paiements',
      detail: 'Action requise',
    },
    {
      label: 'Demandes à traiter',
      valeur: nbDemandesATraiter ?? 0,
      icone: Disc3,
      href: '/admin/sorties',
      detail: 'Vérification ou correction',
    },
  ];

  return (
    <>
      <EntetePage
        titre="Vue d’ensemble"
        sousTitre="Suivez l’activité de la plateforme et traitez les demandes en attente."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/paiements"
              className="inline-flex items-center gap-1.5 rounded-xl border border-marine-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-marine-700 shadow-sm hover:bg-marine-50"
            >
              Paiements
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/admin/formules"
              className="inline-flex items-center gap-1.5 rounded-xl border border-marine-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-marine-700 shadow-sm hover:bg-marine-50"
            >
              <Layers aria-hidden="true" className="h-3.5 w-3.5" />
              Formules
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statistiques.map(({ label, valeur, icone: Icone, href, detail }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-2xl border border-marine-900/[0.06] bg-white p-4 shadow-sm transition hover:border-azur-200 hover:shadow-carte"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-azur-50 text-azur-700">
                <Icone aria-hidden="true" className="h-5 w-5" />
              </span>
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 text-marine-300 transition group-hover:translate-x-0.5 group-hover:text-azur-600"
              />
            </div>
            <p className="mt-3 font-display text-2xl font-extrabold text-marine-950">{valeur}</p>
            <p className="text-sm font-semibold text-marine-800">{label}</p>
            <p className="text-xs text-marine-400">{detail}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-marine-950">Paiements à vérifier</h2>
              <p className="mt-0.5 text-sm text-marine-600">Vérifiez la réception réelle avant d’activer.</p>
            </div>
            <Link href="/admin/paiements" className="text-xs font-semibold text-azur-700 hover:underline">
              Tout voir
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {(paiements ?? []).length === 0 ? (
              <p className="rounded-2xl bg-marine-50/60 px-4 py-6 text-center text-sm text-marine-500">
                Aucun paiement en attente de vérification.
              </p>
            ) : (
              (paiements ?? []).map((element) => {
                const profil = profils.get(element.user_id);
                return (
                  <div
                    key={element.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-marine-100 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-marine-950">
                        {profil?.nom_artiste ?? 'Artiste'} · {fcfa(element.montant_fcfa)}
                      </p>
                      <p className="text-xs text-marine-500">
                        {MOYENS_PAIEMENT[element.moyen]} · Réf. {element.reference_paiement ?? '—'} ·{' '}
                        {dateHeure(element.created_at)}
                      </p>
                    </div>
                    <Badge ton={statutPaiement(element.statut).ton}>
                      {statutPaiement(element.statut).label}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-marine-950">Demandes à traiter</h2>
              <p className="mt-0.5 text-sm text-marine-600">Vérifications et corrections en attente.</p>
            </div>
            <Link href="/admin/sorties" className="text-xs font-semibold text-azur-700 hover:underline">
              Tout voir
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {(sorties ?? []).length === 0 ? (
              <p className="rounded-2xl bg-marine-50/60 px-4 py-6 text-center text-sm text-marine-500">
                Aucune demande en attente. Tout est à jour.
              </p>
            ) : (
              (sorties ?? []).map((element) => {
                const profil = profils.get(element.user_id);
                const statut = statutSortie(element.statut);
                return (
                  <Link
                    key={element.id}
                    href={`/admin/sorties/${element.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-marine-100 px-4 py-3 transition hover:border-azur-200 hover:bg-azur-50/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-marine-950">
                        {element.titre || 'Demande sans titre'}
                      </p>
                      <p className="truncate text-xs text-marine-500">
                        {profil?.nom_artiste ?? 'Artiste'} · mise à jour le {dateHeure(element.updated_at)}
                      </p>
                    </div>
                    <Badge ton={statut.ton}>{statut.label}</Badge>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-azur-600" />
          <h2 className="font-display text-lg font-bold text-marine-950">Journal d’administration</h2>
        </div>
        <p className="mt-0.5 text-sm text-marine-600">
          Chaque validation ou modification sensible est enregistrée avec son auteur et son horodatage.
        </p>

        <div className="mt-4 divide-y divide-marine-100">
          {(journal ?? []).length === 0 ? (
            <p className="py-4 text-sm text-marine-500">Aucune action enregistrée pour le moment.</p>
          ) : (
            (journal ?? []).map((element) => (
              <div key={element.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium text-marine-900">
                    {libellesActions[element.action] ?? element.action}
                  </p>
                  <p className="text-xs text-marine-400">
                    Cible : {element.cible?.slice(0, 8) ?? '—'}… · {dateHeure(element.created_at)}
                  </p>
                </div>
                <Badge ton="neutre" point={false}>
                  {element.action}
                </Badge>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
