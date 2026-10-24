import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, Clock3, CreditCard, Info, ShieldCheck } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { ChoixFormule } from '@/components/espace/choix-formule';
import { Alerte } from '@/components/ui/alerte';
import { Badge } from '@/components/ui/badge';
import { LienBouton } from '@/components/ui/button';
import { exigerProfil } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';
import { getFormulesPubliques } from '@/lib/plans';
import { dateHeure, dateLongue, fcfa, joursRestants } from '@/lib/format';
import {
  abonnementValide,
  MOYENS_PAIEMENT,
  statutAbonnement,
  statutAbonnementEffectif,
  statutPaiement,
} from '@/lib/statuts';
import { paiement, site } from '@/config/site';

export const metadata: Metadata = { title: 'Mon abonnement' };

export default async function PageAbonnement({
  searchParams,
}: {
  searchParams: Promise<{ besoin?: string; paiement?: string; erreur?: string }>;
}) {
  const params = await searchParams;
  const profil = await exigerProfil('/espace/abonnement');
  const supabase = await creerClientServeur();

  const [{ data: abonnementsData }, { data: paiementsData }, formules] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', profil.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .eq('user_id', profil.id)
      .order('created_at', { ascending: false }),
    getFormulesPubliques(),
  ]);

  const abonnements = abonnementsData ?? [];
  const paiements = paiementsData ?? [];
  const abonnementActif = abonnements.find((element) => abonnementValide(element)) ?? null;
  const enAttente = abonnements.find((element) => element.statut === 'en_attente_paiement') ?? null;
  const dernier = abonnementActif ?? enAttente ?? abonnements[0] ?? null;
  const statutAffiche = dernier ? statutAbonnementEffectif(dernier) : null;
  const definition = statutAffiche ? statutAbonnement(statutAffiche) : null;

  const paiementDeLAttente = enAttente
    ? paiements.find(
        (element) => element.subscription_id === enAttente.id && ['en_attente', 'a_verifier'].includes(element.statut),
      )
    : null;

  const messageBlocage = abonnementActif
    ? `Votre abonnement ${abonnementActif.plan_nom} est actif jusqu’au ${dateLongue(abonnementActif.fin)}. Pour changer de formule ou renouveler, contactez notre équipe.`
    : enAttente
      ? paiementDeLAttente
        ? 'Votre paiement est en cours de vérification. Vous pourrez choisir une nouvelle formule dès que cette vérification sera terminée.'
        : 'Votre abonnement est en attente de paiement. Déclarez votre paiement ci-dessous pour permettre sa vérification.'
      : null;

  return (
    <>
      <EntetePage
        titre="Mon abonnement"
        sousTitre="Consultez votre formule, son statut et l’historique de vos paiements."
      />

      <div className="space-y-4">
        {params.besoin === 'sortie' && (
          <Alerte type="attention" titre="Un abonnement actif est nécessaire">
            Pour soumettre une demande de distribution, vous devez d’abord choisir une formule et
            faire vérifier votre paiement. Vous pouvez préparer votre musique en attendant.
          </Alerte>
        )}
        {params.paiement === 'declare' && (
          <Alerte type="succes" titre="Déclaration enregistrée">
            Merci. Notre équipe vérifie maintenant la réception de votre paiement{' '}
            {paiement.manuel.delaiVerification}. Votre abonnement sera activé après confirmation.
          </Alerte>
        )}
        {params.erreur && <Alerte type="erreur">L’opération n’a pas pu être effectuée.</Alerte>}
      </div>

      <section className="mt-5 overflow-hidden rounded-3xl border border-marine-900/[0.06] bg-white shadow-carte">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard aria-hidden="true" className="h-4 w-4 text-azur-600" />
              <p className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                Abonnement actuel
              </p>
            </div>
            <h2 className="mt-1.5 font-display text-2xl font-extrabold text-marine-950">
              {dernier ? dernier.plan_nom : 'Aucune formule'}
            </h2>
            <p className="mt-1 text-sm text-marine-500">
              {dernier
                ? `${fcfa(dernier.prix_fcfa)} pour ${dernier.duree_jours} jours`
                : 'Choisissez une formule ci-dessous pour commencer.'}
            </p>
          </div>
          {definition ? <Badge ton={definition.ton}>{definition.label}</Badge> : <Badge ton="neutre">Non souscrit</Badge>}
        </div>

        {dernier && (
          <div className="grid gap-3 border-t border-marine-100 bg-marine-50/40 p-5 text-sm sm:grid-cols-3 sm:p-6">
            <div className="flex items-start gap-2">
              <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
              <div>
                <p className="text-xs text-marine-400">Début</p>
                <p className="font-medium text-marine-900">{dateLongue(dernier.debut)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
              <div>
                <p className="text-xs text-marine-400">Fin</p>
                <p className="font-medium text-marine-900">{dateLongue(dernier.fin)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
              <div>
                <p className="text-xs text-marine-400">Échéance</p>
                <p className="font-medium text-marine-900">
                  {dernier.fin && abonnementValide(dernier)
                    ? `${joursRestants(dernier.fin)} jour(s) restant(s)`
                    : definition?.description ?? '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {enAttente && (
          <div className="border-t border-marine-100 p-5 sm:p-6">
            {paiementDeLAttente ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Clock3 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-marine-950">Paiement en cours de vérification</p>
                    <p className="mt-0.5 text-xs text-marine-600">
                      Référence : {paiementDeLAttente.reference_paiement} · déclaré le{' '}
                      {dateHeure(paiementDeLAttente.created_at)}
                    </p>
                  </div>
                </div>
                <Badge ton={statutPaiement(paiementDeLAttente.statut).ton}>
                  {statutPaiement(paiementDeLAttente.statut).label}
                </Badge>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-marine-600">
                  Votre abonnement est réservé. Déclarez votre paiement pour lancer la vérification.
                </p>
                <LienBouton href="/espace/abonnement/paiement" variante="principal" taille="md">
                  Déclarer mon paiement
                </LienBouton>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="mt-5">
        {messageBlocage ? (
          <Alerte type={abonnementActif ? 'succes' : 'info'}>{messageBlocage}</Alerte>
        ) : (
          <>
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-azur-200/70 bg-azur-50/60 px-4 py-3 text-xs leading-relaxed text-azur-900">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {paiement.enLigne.actif
                  ? 'Le paiement en ligne est disponible. Vous serez redirigé vers une page sécurisée.'
                  : 'Le paiement en ligne n’est pas encore disponible. Choisissez une formule, puis déclarez un paiement manuel : notre équipe le vérifiera avant d’activer votre abonnement.'}
              </p>
            </div>
            <ChoixFormule formules={formules} bloque={null} />
          </>
        )}
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-marine-950">Historique des paiements</h2>
        {paiements.length === 0 ? (
          <p className="mt-2 text-sm text-marine-500">
            Aucun paiement enregistré pour le moment. Après votre déclaration, elle apparaîtra ici.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {paiements.map((element) => {
              const statut = statutPaiement(element.statut);
              return (
                <li
                  key={element.id}
                  className="flex flex-col gap-2 rounded-2xl border border-marine-900/[0.06] bg-white px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-marine-950">
                      {fcfa(element.montant_fcfa)} · {MOYENS_PAIEMENT[element.moyen] ?? element.moyen}
                    </p>
                    <p className="mt-0.5 text-xs text-marine-500">
                      {dateHeure(element.created_at)} · Réf. {element.reference_paiement ?? '—'}
                    </p>
                    {element.note_admin && (
                      <p className="mt-1 text-xs text-marine-600">Note : {element.note_admin}</p>
                    )}
                  </div>
                  <Badge ton={statut.ton}>{statut.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-white px-4 py-3 text-xs text-marine-500 shadow-sm ring-1 ring-marine-900/5">
        <span className="flex items-center gap-1.5">
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
          Activation uniquement après vérification du paiement
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
          Aucun prélèvement automatique
        </span>
        <Link href="/espace/sorties" className="font-semibold text-azur-700 hover:underline">
          Retour à mes sorties
        </Link>
        <a href={`mailto:${site.contact.email}`} className="font-semibold text-azur-700 hover:underline">
          Besoin d’aide ?
        </a>
      </div>
    </>
  );
}
