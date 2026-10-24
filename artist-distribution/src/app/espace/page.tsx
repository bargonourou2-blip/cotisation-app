import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Disc3,
  Plus,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { CarteSortie } from '@/components/espace/carte-sortie';
import { EtatVide } from '@/components/ui/etat-vide';
import { Alerte } from '@/components/ui/alerte';
import { Badge } from '@/components/ui/badge';
import { LienBouton } from '@/components/ui/button';
import { exigerProfil } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';
import { dateLongue, fcfa, joursRestants } from '@/lib/format';
import { abonnementValide, statutAbonnement, statutAbonnementEffectif, TYPES_COMPTE } from '@/lib/statuts';
import { liensPochettes } from '@/lib/storage';
import { paiement, site } from '@/config/site';
import type { Paiement } from '@/types/database';

export const metadata: Metadata = { title: 'Tableau de bord' };

export default async function PageTableauDeBord({
  searchParams,
}: {
  searchParams: Promise<{ bienvenue?: string; message?: string }>;
}) {
  const params = await searchParams;
  const profil = await exigerProfil('/espace');
  const supabase = await creerClientServeur();

  const [{ data: abonnementsData }, { data: sortiesData }, { data: paiementsData }] =
    await Promise.all([
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', profil.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('releases')
        .select('*')
        .eq('user_id', profil.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('payments')
        .select('*')
        .eq('user_id', profil.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

  const abonnements = abonnementsData ?? [];
  const sorties = sortiesData ?? [];
  const paiements: Paiement[] = paiementsData ?? [];

  const abonnementActif = abonnements.find((element) => abonnementValide(element)) ?? null;
  const abonnement = abonnementActif ?? abonnements[0] ?? null;
  const enAttente = abonnements.find((element) => element.statut === 'en_attente_paiement') ?? null;
  const paiementEnCours = paiements.find((element) => element.statut === 'a_verifier') ?? null;
  const statutAbo = statutAbonnementEffectif(abonnement);
  const definitionAbo = statutAbo ? statutAbonnement(statutAbo) : null;
  const peutSoumettre = Boolean(abonnementActif);

  const recentes = sorties.slice(0, 3);
  const liens = await liensPochettes(
    supabase,
    recentes.map((element) => element.pochette_path).filter((chemin): chemin is string => Boolean(chemin)),
  );

  const sortiesEnCours = sorties.filter(
    (element) => !['brouillon', 'publiee', 'refusee'].includes(element.statut),
  ).length;

  return (
    <>
      <EntetePage
        titre={`Bonjour, ${profil.nom_artiste}`}
        sousTitre="Voici un aperçu de votre espace, de votre abonnement et de vos demandes de distribution."
        action={
          <LienBouton
            href={peutSoumettre ? '/espace/sorties/nouvelle' : '/espace/abonnement'}
            variante="principal"
            taille="md"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {peutSoumettre ? 'Soumettre une nouvelle musique' : 'Activer mon abonnement'}
          </LienBouton>
        }
      />

      <div className="space-y-4">
        {params.bienvenue && (
          <Alerte type="succes" titre={`Bienvenue, ${profil.nom_artiste} !`}>
            Votre compte est créé. {peutSoumettre
              ? 'Votre abonnement est suivi depuis votre espace. Vous pouvez soumettre une sortie quand vous le souhaitez.'
              : 'Choisissez maintenant votre formule : vous pourrez soumettre votre première musique plus tard, quand elle sera prête.'}
          </Alerte>
        )}
        {params.message === 'mot-de-passe-modifie' && (
          <Alerte type="succes">Votre mot de passe a bien été modifié.</Alerte>
        )}
        {paiementEnCours && (
          <Alerte type="attention" titre="Paiement en cours de vérification">
            Votre déclaration a bien été enregistrée (référence : {paiementEnCours.reference_paiement ?? '—'}).
            Notre équipe vérifie la réception du paiement {paiement.manuel.delaiVerification}. Votre
            abonnement sera activé après confirmation.
          </Alerte>
        )}
        {!peutSoumettre && !enAttente && (
          <Alerte type="info" titre="Votre musique peut attendre">
            Vous n’avez pas encore choisi de formule. C’est indispensable pour soumettre une sortie,
            mais vous pouvez créer votre compte et revenir plus tard. Aucune information musicale ne
            vous est demandée pour l’instant.
          </Alerte>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-marine-900/[0.06] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-marine-400">
            <CreditCard aria-hidden="true" className="h-3.5 w-3.5" />
            Formule actuelle
          </div>
          <p className="mt-2 font-display text-lg font-bold text-marine-950">
            {abonnement ? abonnement.plan_nom : 'Aucune formule'}
          </p>
          <p className="mt-1 text-xs text-marine-500">
            {abonnement ? fcfa(abonnement.prix_fcfa) : 'Choisissez une formule pour commencer'}
          </p>
        </div>

        <div className="rounded-2xl border border-marine-900/[0.06] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-marine-400">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            Abonnement
          </div>
          <div className="mt-2">
            {definitionAbo ? (
              <Badge ton={definitionAbo.ton}>{definitionAbo.label}</Badge>
            ) : (
              <Badge ton="neutre">Non souscrit</Badge>
            )}
          </div>
          <p className="mt-2 text-xs text-marine-500">
            {abonnementActif?.fin
              ? `Jusqu’au ${dateLongue(abonnementActif.fin)} (${joursRestants(abonnementActif.fin)} j restants)`
              : enAttente
                ? 'Paiement en attente'
                : 'Aucune échéance'}
          </p>
        </div>

        <div className="rounded-2xl border border-marine-900/[0.06] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-marine-400">
            <Disc3 aria-hidden="true" className="h-3.5 w-3.5" />
            Mes sorties
          </div>
          <p className="mt-2 font-display text-lg font-bold text-marine-950">
            {sorties.length} demande{sorties.length > 1 ? 's' : ''}
          </p>
          <p className="mt-1 text-xs text-marine-500">
            {sortiesEnCours > 0 ? `${sortiesEnCours} en cours de traitement` : 'Aucune en cours'}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-marine-950">Mes sorties musicales</h2>
              <p className="mt-1 text-sm text-marine-600">
                Suivez l’avancement de chaque demande de distribution.
              </p>
            </div>
            {sorties.length > 0 && (
              <Link
                href="/espace/sorties"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-azur-700 hover:underline"
              >
                Tout voir <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {recentes.length > 0 ? (
              recentes.map((sortie) => (
                <CarteSortie
                  key={sortie.id}
                  sortie={sortie}
                  pochetteUrl={sortie.pochette_path ? liens.get(sortie.pochette_path) : null}
                />
              ))
            ) : (
              <EtatVide
                icone={<Disc3 aria-hidden="true" className="h-6 w-6" />}
                titre="Aucune sortie pour le moment"
                description="Vous n’avez pas encore de morceau prêt ? C’est tout à fait normal. Votre compte peut rester actif : revenez quand votre musique sera prête et ouvrez votre première demande de distribution."
                action={
                  <LienBouton
                    href={peutSoumettre ? '/espace/sorties/nouvelle' : '/espace/abonnement'}
                    variante={peutSoumettre ? 'principal' : 'secondaire'}
                    taille="md"
                  >
                    {peutSoumettre ? 'Soumettre une nouvelle musique' : 'Choisir une formule'}
                  </LienBouton>
                }
              />
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-3xl bg-marine-950 p-5 text-white shadow-carte sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                  Mon abonnement
                </p>
                <h2 className="mt-1 font-display text-xl font-bold text-white">
                  {abonnement ? abonnement.plan_nom : 'Aucune formule'}
                </h2>
              </div>
              {definitionAbo && (
                <Badge
                  ton={definitionAbo.ton}
                  className="border border-white/10 bg-white/10 text-white ring-white/10"
                >
                  {definitionAbo.label}
                </Badge>
              )}
            </div>

            {abonnement ? (
              <div className="mt-4 space-y-1.5 text-sm text-marine-300">
                <p className="flex items-center gap-2">
                  <CalendarDays aria-hidden="true" className="h-4 w-4 text-azur-300" />
                  {abonnementActif
                    ? `Actif jusqu’au ${dateLongue(abonnementActif.fin)}`
                    : abonnement.statut === 'en_attente_paiement'
                      ? 'En attente de paiement et de vérification'
                      : `Statut : ${statutAbonnement(abonnement.statut).label}`}
                </p>
                <p className="text-xs text-marine-400">
                  Formule {abonnement.plan_nom} · {fcfa(abonnement.prix_fcfa)}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-marine-300">
                Choisissez une formule pour pouvoir soumettre vos sorties musicales. Le paiement en
                ligne n’est pas disponible : vous pouvez déclarer un paiement manuel, vérifié par
                notre équipe.
              </p>
            )}

            <LienBouton
              href="/espace/abonnement"
              variante="clair"
              taille="md"
              className="mt-5 w-full"
            >
              Gérer mon abonnement
            </LienBouton>
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-azur-50 text-azur-700">
                  <UserRound aria-hidden="true" className="h-4 w-4" />
                </span>
                <h2 className="font-display text-base font-bold text-marine-950">Mon profil</h2>
              </div>
              <Link href="/espace/profil" className="text-xs font-semibold text-azur-700 hover:underline">
                Modifier
              </Link>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-marine-400">Nom complet</dt>
                <dd className="font-medium text-marine-900">{profil.nom_complet}</dd>
              </div>
              <div>
                <dt className="text-xs text-marine-400">E-mail</dt>
                <dd className="break-all font-medium text-marine-900">{profil.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-marine-400">Téléphone / WhatsApp</dt>
                <dd className="font-medium text-marine-900">{profil.telephone}</dd>
              </div>
              <div>
                <dt className="text-xs text-marine-400">Pays · Type de compte</dt>
                <dd className="font-medium text-marine-900">
                  {profil.pays} · {TYPES_COMPTE[profil.type_compte]}
                </dd>
              </div>
            </dl>
          </section>

          <div className="rounded-2xl border border-marine-200/70 bg-marine-50/60 px-4 py-3 text-xs leading-relaxed text-marine-600">
            <CheckCircle2 aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
            Une question ? Écrivez-nous à{' '}
            <a href={`mailto:${site.contact.email}`} className="font-semibold text-azur-700 hover:underline">
              {site.contact.email}
            </a>
            . Réponse {site.delaiReponse}.
          </div>
        </div>
      </div>
    </>
  );
}
