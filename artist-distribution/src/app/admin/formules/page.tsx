import type { Metadata } from 'next';
import Link from 'next/link';
import { Pencil, Plus } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { basculerActivationFormule } from '@/actions/admin';
import { Alerte } from '@/components/ui/alerte';
import { Badge } from '@/components/ui/badge';
import { creerClientServeur } from '@/lib/supabase/server';
import { duree, fcfa } from '@/lib/format';

export const metadata: Metadata = { title: 'Formules d’abonnement' };

export default async function PageFormules({
  searchParams,
}: {
  searchParams: Promise<{ enregistre?: string }>;
}) {
  const params = await searchParams;
  const supabase = await creerClientServeur();
  const { data: formules } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('ordre', { ascending: true });

  return (
    <>
      <EntetePage
        titre="Formules d’abonnement"
        sousTitre="Les formules enregistrées ici sont celles affichées sur le site public et dans l’espace artiste."
        action={
          <Link
            href="/admin/formules/nouvelle"
            className="inline-flex items-center gap-2 rounded-xl bg-azur-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-azur-700"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Nouvelle formule
          </Link>
        }
      />

      {params.enregistre && (
        <div className="mb-5">
          <Alerte type="succes">Les formules ont été mises à jour.</Alerte>
        </div>
      )}

      <Alerte type="info" titre="Tarifs">
        Les tarifs sont provisoires tant qu’ils ne sont pas validés. Modifiez-les ici : les
        abonnements déjà souscrits conservent leur montant d’origine.
      </Alerte>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {(formules ?? []).map((formule) => (
          <article
            key={formule.id}
            className="flex flex-col rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-marine-950">{formule.nom}</h2>
                <p className="mt-0.5 font-mono text-[0.65rem] text-marine-400">{formule.code}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge ton={formule.actif ? 'succes' : 'neutre'}>
                  {formule.actif ? 'Active' : 'Inactive'}
                </Badge>
                {formule.mis_en_avant && <Badge ton="info">Mise en avant</Badge>}
              </div>
            </div>

            <p className="mt-3 font-display text-2xl font-extrabold text-marine-950">
              {fcfa(formule.prix_fcfa)}
              <span className="ml-1 text-xs font-medium text-marine-500">
                / {duree(formule.duree_jours)}
              </span>
            </p>
            <p className="mt-1 text-xs text-marine-500">{formule.description || 'Sans description'}</p>

            <ul className="mt-3 flex-1 space-y-1.5 text-xs text-marine-600">
              {(formule.avantages ?? []).slice(0, 5).map((avantage) => (
                <li key={avantage} className="flex gap-1.5">
                  <span aria-hidden="true" className="text-azur-500">
                    •
                  </span>
                  {avantage}
                </li>
              ))}
              {(formule.avantages ?? []).length === 0 && <li className="text-marine-400">Aucun avantage listé.</li>}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-marine-100 pt-3">
              <Link
                href={`/admin/formules/${formule.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-marine-200 px-3 py-1.5 text-xs font-semibold text-marine-700 hover:bg-marine-50"
              >
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                Modifier
              </Link>
              <form action={basculerActivationFormule}>
                <input type="hidden" name="id" value={formule.id} />
                <input type="hidden" name="actif" value={formule.actif ? 'non' : 'oui'} />
                <button
                  type="submit"
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-marine-500 hover:bg-marine-50 hover:text-marine-800"
                >
                  {formule.actif ? 'Désactiver' : 'Activer'}
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>

      {(formules ?? []).length === 0 && (
        <div className="mt-5 rounded-3xl border border-dashed border-marine-200 bg-white px-6 py-12 text-center">
          <p className="font-semibold text-marine-900">Aucune formule enregistrée</p>
          <p className="mt-1 text-sm text-marine-500">
            Créez votre première formule ou exécutez le fichier <code>supabase/seed.sql</code>.
          </p>
        </div>
      )}
    </>
  );
}
