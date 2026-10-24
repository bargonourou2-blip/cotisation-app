import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck, Wallet } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { VerificationPaiement } from '@/components/admin/verification-paiement';
import { Alerte } from '@/components/ui/alerte';
import { Badge } from '@/components/ui/badge';
import { creerClientServeur } from '@/lib/supabase/server';
import { profilsParIds } from '@/lib/admin';
import { dateHeure, fcfa } from '@/lib/format';
import { MOYENS_PAIEMENT, statutPaiement } from '@/lib/statuts';

export const metadata: Metadata = { title: 'Paiements' };

export default async function PagePaiements() {
  const supabase = await creerClientServeur();

  const { data: paiementsData } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const paiements = paiementsData ?? [];
  const profils = await profilsParIds(
    supabase,
    paiements.map((element) => element.user_id),
  );

  const abonnementIds = Array.from(new Set(paiements.map((element) => element.subscription_id)));
  const { data: abonnementsData } = abonnementIds.length
    ? await supabase.from('subscriptions').select('*').in('id', abonnementIds)
    : { data: [] as Array<{ id: string; plan_nom: string; duree_jours: number }> };
  const abonnements = new Map((abonnementsData ?? []).map((element) => [element.id, element]));

  const aVerifier = paiements.filter((element) => element.statut === 'a_verifier');
  const traites = paiements.filter((element) => element.statut !== 'a_verifier');

  return (
    <>
      <EntetePage
        titre="Paiements"
        sousTitre="Vérifiez la réception effective des paiements avant de confirmer un abonnement."
      />

      <Alerte type="info" titre="Règle de sécurité">
        Ne confirmez un paiement qu’après avoir vérifié la transaction auprès de l’opérateur ou sur
        votre relevé. La confirmation active immédiatement l’abonnement et ne peut pas être annulée
        depuis cette page.
      </Alerte>

      <section className="mt-6">
        <div className="flex items-center gap-2">
          <Wallet aria-hidden="true" className="h-4 w-4 text-azur-600" />
          <h2 className="font-display text-lg font-bold text-marine-950">
            À vérifier ({aVerifier.length})
          </h2>
        </div>

        <div className="mt-3 space-y-3">
          {aVerifier.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-marine-900/[0.06] bg-white px-4 py-6 text-sm text-marine-500 shadow-sm">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-500" />
              Aucun paiement en attente de vérification.
            </div>
          ) : (
            aVerifier.map((element) => {
              const profil = profils.get(element.user_id);
              const abonnement = abonnements.get(element.subscription_id);
              return (
                <article
                  key={element.id}
                  className="rounded-3xl border border-amber-200/70 bg-white p-5 shadow-carte"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-base font-bold text-marine-950">
                        {profil?.nom_artiste ?? 'Artiste'}{' '}
                        <span className="text-sm font-normal text-marine-500">
                          ({profil?.nom_complet ?? '—'})
                        </span>
                      </p>
                      <p className="mt-0.5 break-all text-xs text-marine-500">{profil?.email}</p>
                    </div>
                    <Badge ton={statutPaiement(element.statut).ton}>
                      {statutPaiement(element.statut).label}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <dt className="text-xs text-marine-400">Montant déclaré</dt>
                      <dd className="font-semibold text-marine-950">{fcfa(element.montant_fcfa)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-marine-400">Moyen</dt>
                      <dd className="font-medium text-marine-900">
                        {MOYENS_PAIEMENT[element.moyen] ?? element.moyen}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-marine-400">Référence</dt>
                      <dd className="break-all font-medium text-marine-900">
                        {element.reference_paiement ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-marine-400">Téléphone payeur</dt>
                      <dd className="font-medium text-marine-900">{element.telephone_payeur ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-marine-400">Formule</dt>
                      <dd className="font-medium text-marine-900">
                        {abonnement ? `${abonnement.plan_nom} (${abonnement.duree_jours} j)` : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-marine-400">Déclaré le</dt>
                      <dd className="font-medium text-marine-900">{dateHeure(element.created_at)}</dd>
                    </div>
                  </dl>

                  {element.note_client && (
                    <p className="mt-3 rounded-xl bg-marine-50 px-3 py-2 text-xs text-marine-600">
                      Message de l’artiste : {element.note_client}
                    </p>
                  )}

                  <VerificationPaiement paiementId={element.id} />
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-marine-950">Historique</h2>
        <div className="mt-3 overflow-hidden rounded-3xl border border-marine-900/[0.06] bg-white shadow-carte">
          {traites.length === 0 ? (
            <p className="px-5 py-6 text-sm text-marine-500">Aucun paiement traité pour le moment.</p>
          ) : (
            <ul className="divide-y divide-marine-100">
              {traites.map((element) => {
                const profil = profils.get(element.user_id);
                const statut = statutPaiement(element.statut);
                return (
                  <li key={element.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-marine-950">
                          {profil?.nom_artiste ?? 'Artiste'} · {fcfa(element.montant_fcfa)}
                        </p>
                        <p className="mt-0.5 text-xs text-marine-500">
                          {MOYENS_PAIEMENT[element.moyen]} · Réf. {element.reference_paiement ?? '—'} ·{' '}
                          {dateHeure(element.created_at)}
                        </p>
                        {element.note_admin && (
                          <p className="mt-1 text-xs text-marine-600">Note : {element.note_admin}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge ton={statut.ton}>{statut.label}</Badge>
                        <Link
                          href={`/admin/artistes/${element.user_id}`}
                          className="text-xs font-semibold text-azur-700 hover:underline"
                        >
                          Artiste
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <p className="mt-5 flex items-center gap-1.5 text-xs text-marine-400">
        <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
        Toutes les confirmations sont tracées dans le journal d’administration.
      </p>
    </>
  );
}
