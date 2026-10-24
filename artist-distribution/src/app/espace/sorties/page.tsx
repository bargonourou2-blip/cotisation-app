import type { Metadata } from 'next';
import Link from 'next/link';
import { Disc3, Plus } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { CarteSortie } from '@/components/espace/carte-sortie';
import { EtatVide } from '@/components/ui/etat-vide';
import { Alerte } from '@/components/ui/alerte';
import { LienBouton } from '@/components/ui/button';
import { exigerProfil } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';
import { abonnementValide } from '@/lib/statuts';
import { liensPochettes } from '@/lib/storage';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Mes sorties' };

type Filtre = 'toutes' | 'en_cours' | 'brouillons' | 'terminees';

const filtres: Array<{ code: Filtre; label: string }> = [
  { code: 'toutes', label: 'Toutes' },
  { code: 'en_cours', label: 'En cours' },
  { code: 'brouillons', label: 'Brouillons' },
  { code: 'terminees', label: 'Terminées' },
];

export default async function PageSorties({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string; supprime?: string; erreur?: string }>;
}) {
  const params = await searchParams;
  const profil = await exigerProfil('/espace/sorties');
  const supabase = await creerClientServeur();

  const [{ data: sortiesData }, { data: abonnements }] = await Promise.all([
    supabase.from('releases').select('*').eq('user_id', profil.id).order('updated_at', { ascending: false }),
    supabase.from('subscriptions').select('statut, fin').eq('user_id', profil.id).eq('statut', 'actif'),
  ]);

  const sorties = sortiesData ?? [];
  const aUnAbonnement = (abonnements ?? []).some((element) => abonnementValide(element));
  const filtre: Filtre = (['toutes', 'en_cours', 'brouillons', 'terminees'] as const).includes(
    params.filtre as Filtre,
  )
    ? (params.filtre as Filtre)
    : 'toutes';

  const parStatut = {
    en_cours: sorties.filter((element) =>
      ['en_attente_verification', 'informations_a_corriger', 'validee', 'en_preparation', 'envoyee_plateformes'].includes(
        element.statut,
      ),
    ),
    brouillons: sorties.filter((element) => element.statut === 'brouillon'),
    terminees: sorties.filter((element) => ['publiee', 'refusee'].includes(element.statut)),
  };

  const affichees =
    filtre === 'toutes'
      ? sorties
      : filtre === 'en_cours'
        ? parStatut.en_cours
        : filtre === 'brouillons'
          ? parStatut.brouillons
          : parStatut.terminees;

  const liens = await liensPochettes(
    supabase,
    sorties.map((element) => element.pochette_path).filter((chemin): chemin is string => Boolean(chemin)),
  );

  const compteurs: Record<Filtre, number> = {
    toutes: sorties.length,
    en_cours: parStatut.en_cours.length,
    brouillons: parStatut.brouillons.length,
    terminees: parStatut.terminees.length,
  };

  return (
    <>
      <EntetePage
        titre="Mes demandes de distribution"
        sousTitre="Chaque sortie est une demande distincte. Vous pouvez en préparer plusieurs au fil du temps."
        action={
          <LienBouton
            href={aUnAbonnement ? '/espace/sorties/nouvelle' : '/espace/abonnement'}
            variante="principal"
            taille="md"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Nouvelle demande
          </LienBouton>
        }
      />

      <div className="space-y-4">
        {params.supprime && <Alerte type="succes">Le brouillon a été supprimé.</Alerte>}
        {params.erreur && (
          <Alerte type="erreur">
            Cette action n’est pas possible. Seuls les brouillons peuvent être supprimés.
          </Alerte>
        )}
        {!aUnAbonnement && (
          <Alerte type="attention" titre="Un abonnement actif est nécessaire">
            Vous pouvez préparer et enregistrer des brouillons, mais l’envoi pour vérification
            nécessite un abonnement actif.{' '}
            <Link href="/espace/abonnement" className="font-semibold underline underline-offset-2">
              Voir les formules
            </Link>
            .
          </Alerte>
        )}
      </div>

      {sorties.length > 0 && (
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1 defilement-doux">
          {filtres.map((element) => (
            <Link
              key={element.code}
              href={element.code === 'toutes' ? '/espace/sorties' : `/espace/sorties?filtre=${element.code}`}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition',
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
      )}

      <div className="mt-5">
        {affichees.length > 0 ? (
          <div className="space-y-3">
            {affichees.map((sortie) => (
              <CarteSortie
                key={sortie.id}
                sortie={sortie}
                pochetteUrl={sortie.pochette_path ? liens.get(sortie.pochette_path) : null}
              />
            ))}
          </div>
        ) : sorties.length === 0 ? (
          <EtatVide
            icone={<Disc3 aria-hidden="true" className="h-6 w-6" />}
            titre="Vous n’avez pas encore de demande"
            description="Aucune pression : votre musique peut attendre. Quand un titre ou un projet sera prêt, ouvrez une demande de distribution et suivez son avancement ici."
            action={
              <LienBouton
                href={aUnAbonnement ? '/espace/sorties/nouvelle' : '/espace/abonnement'}
                variante="principal"
                taille="md"
              >
                {aUnAbonnement ? 'Soumettre une nouvelle musique' : 'Choisir une formule'}
              </LienBouton>
            }
          />
        ) : (
          <EtatVide
            icone={<Disc3 aria-hidden="true" className="h-6 w-6" />}
            titre="Aucune demande dans cette catégorie"
            description="Changez de filtre pour voir vos autres demandes de distribution."
            action={
              <LienBouton href="/espace/sorties" variante="secondaire" taille="md">
                Voir toutes mes demandes
              </LienBouton>
            }
          />
        )}
      </div>
    </>
  );
}
