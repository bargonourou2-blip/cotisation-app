import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  Mail,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { FormulairePaiement } from '@/components/espace/formulaire-paiement';
import { Alerte } from '@/components/ui/alerte';
import { Badge } from '@/components/ui/badge';
import { exigerProfil } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';
import { dateHeure, fcfa } from '@/lib/format';
import { statutPaiement } from '@/lib/statuts';
import { paiement, site } from '@/config/site';
import { paiementEnLigneDisponible } from '@/lib/paiements/prestataire';

export const metadata: Metadata = { title: 'Régler mon abonnement' };

const iconesMoyens = {
  mobile_money: Smartphone,
  virement: Banknote,
  especes: Banknote,
  autre: CreditCard,
} as const;

export default async function PagePaiement({
  searchParams,
}: {
  searchParams: Promise<{ nouveau?: string }>;
}) {
  await searchParams;
  const profil = await exigerProfil('/espace/abonnement/paiement');
  const supabase = await creerClientServeur();

  const { data: abonnements } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', profil.id)
    .eq('statut', 'en_attente_paiement')
    .order('created_at', { ascending: false })
    .limit(1);

  const abonnement = abonnements?.[0];
  if (!abonnement) redirect('/espace/abonnement');

  const { data: paiementExistant } = await supabase
    .from('payments')
    .select('*')
    .eq('subscription_id', abonnement.id)
    .in('statut', ['en_attente', 'a_verifier'])
    .maybeSingle();

  const enLigne = paiementEnLigneDisponible();

  return (
    <>
      <Link
        href="/espace/abonnement"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-marine-500 hover:text-marine-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Retour à mon abonnement
      </Link>

      <EntetePage
        titre="Régler mon abonnement"
        sousTitre="Suivez les étapes ci-dessous. Votre abonnement sera activé après vérification du paiement."
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                  Montant à régler
                </p>
                <p className="mt-1 font-display text-3xl font-extrabold text-marine-950">
                  {fcfa(abonnement.prix_fcfa)}
                </p>
                <p className="mt-1 text-sm text-marine-500">
                  Formule {abonnement.plan_nom} · {abonnement.duree_jours} jours
                </p>
              </div>
              <Badge ton="attention">En attente de paiement</Badge>
            </div>

            <div className="mt-5 border-t border-marine-100 pt-4">
              {!enLigne && (
                <Alerte type="info" titre="Paiement en ligne indisponible">
                  Aucun prestataire de paiement en ligne n’est configuré pour le moment. Utilisez le
                  paiement manuel ci-dessous : notre équipe vérifie la réception du montant avant
                  d’activer l’abonnement.
                </Alerte>
              )}

              {enLigne && (
                <Alerte type="info" titre="Paiement en ligne">
                  Le paiement en ligne est configuré. Finalisez votre règlement depuis le bouton
                  sécurisé qui sera affiché après validation de la commande.
                </Alerte>
              )}

              {!paiement.manuel.actif && !enLigne && (
                <div className="mt-3">
                  <Alerte type="attention" titre="Aucun moyen de paiement actif">
                    Contactez notre équipe pour connaître les modalités de règlement.
                  </Alerte>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-lg font-bold text-marine-950">
              Comment régler votre abonnement
            </h2>
            <ol className="mt-4 space-y-4">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
                  1
                </span>
                <div>
                  <p className="text-sm font-semibold text-marine-950">
                    Obtenez les coordonnées de paiement
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-marine-600">
                    {paiement.manuel.instructions}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <a
                      href={`mailto:${site.contact.email}?subject=${encodeURIComponent(
                        `Paiement abonnement ${abonnement.plan_nom}`,
                      )}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-marine-200 bg-white px-2.5 py-1.5 font-semibold text-marine-700 hover:bg-marine-50"
                    >
                      <Mail aria-hidden="true" className="h-3.5 w-3.5 text-azur-600" />
                      {site.contact.email}
                    </a>
                    {site.contact.whatsapp && (
                      <a
                        href={`https://wa.me/${site.contact.whatsapp.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-marine-200 bg-white px-2.5 py-1.5 font-semibold text-marine-700 hover:bg-marine-50"
                      >
                        <MessageCircle aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
                  2
                </span>
                <div>
                  <p className="text-sm font-semibold text-marine-950">
                    Effectuez le paiement du montant exact
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-marine-600">
                    Conservez la référence de la transaction fournie par l’opérateur.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
                  3
                </span>
                <div>
                  <p className="text-sm font-semibold text-marine-950">
                    Déclarez votre paiement sur cette page
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-marine-600">
                    Notre équipe vérifie la réception du montant {paiement.manuel.delaiVerification}.
                    Vous recevrez une confirmation dans votre espace.
                  </p>
                </div>
              </li>
            </ol>

            <div className="mt-5 flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
              <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Ne communiquez jamais votre code PIN Mobile Money, même à une personne se présentant
                comme membre de notre équipe. Nous ne demandons jamais votre code secret.
              </p>
            </div>
          </section>

          {paiementExistant ? (
            <section className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <Clock3 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <h2 className="font-display text-base font-bold text-marine-950">
                    Votre déclaration a été reçue
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-marine-700">
                    Référence {paiementExistant.reference_paiement} · déclarée le{' '}
                    {dateHeure(paiementExistant.created_at)}. La vérification est en cours.
                  </p>
                  <div className="mt-2">
                    <Badge ton={statutPaiement(paiementExistant.statut).ton}>
                      {statutPaiement(paiementExistant.statut).label}
                    </Badge>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            paiement.manuel.actif && (
              <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
                <h2 className="font-display text-lg font-bold text-marine-950">
                  Déclarer mon paiement
                </h2>
                <p className="mt-1 text-sm text-marine-600">
                  Renseignez les informations de la transaction effectuée.
                </p>
                <div className="mt-5">
                  <FormulairePaiement abonnementId={abonnement.id} />
                </div>
              </section>
            )
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl bg-marine-950 p-5 text-white sm:p-6">
            <h2 className="font-display text-base font-bold text-white">Ce qui se passe ensuite</h2>
            <ul className="mt-4 space-y-3 text-sm text-marine-300">
              <li className="flex gap-2.5">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                Notre équipe vérifie la transaction auprès de l’opérateur.
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                En cas de confirmation, votre abonnement est activé pour la durée choisie.
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                En cas de problème, vous êtes contacté avec la marche à suivre.
              </li>
            </ul>
            <p className="mt-5 flex items-center gap-1.5 text-xs text-marine-400">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              Aucun prélèvement automatique.
            </p>
          </section>

          <div className="rounded-2xl border border-marine-900/[0.06] bg-white p-4 text-xs leading-relaxed text-marine-600">
            <p className="flex items-center gap-1.5 font-semibold text-marine-900">
              <CreditCard aria-hidden="true" className="h-3.5 w-3.5 text-azur-600" />
              Moyens de paiement
            </p>
            <ul className="mt-2 space-y-1.5">
              {paiement.manuel.moyens.map((moyen) => {
                const Icone = iconesMoyens[moyen.code] ?? CreditCard;
                return (
                  <li key={moyen.code} className="flex items-center gap-1.5">
                    <Icone aria-hidden="true" className="h-3.5 w-3.5 text-marine-400" />
                    {moyen.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
