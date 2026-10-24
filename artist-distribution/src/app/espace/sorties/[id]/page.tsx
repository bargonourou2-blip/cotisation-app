import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Disc3,
  FileAudio,
  Globe2,
  Music2,
  Pencil,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { FriseSortie } from '@/components/espace/frise-sortie';
import { BoutonSoumettreSortie } from '@/components/espace/bouton-soumettre-sortie';
import { BoutonSupprimerSortie } from '@/components/espace/bouton-supprimer-sortie';
import { Badge } from '@/components/ui/badge';
import { Alerte } from '@/components/ui/alerte';
import { LienBouton } from '@/components/ui/button';
import { exigerProfil } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';
import { dateCourte, dateLongue } from '@/lib/format';
import { actionAttendue, abonnementValide, statutSortie, TYPES_SORTIE } from '@/lib/statuts';
import { lienAudio, lienPochette } from '@/lib/storage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await creerClientServeur();
  const { data } = await supabase.from('releases').select('titre').eq('id', id).maybeSingle();
  return { title: data?.titre || 'Demande de distribution' };
}

export default async function PageDetailSortie({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ soumis?: string; enregistre?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const profil = await exigerProfil(`/espace/sorties/${id}`);
  const supabase = await creerClientServeur();

  const { data: sortie } = await supabase.from('releases').select('*').eq('id', id).maybeSingle();
  if (!sortie || sortie.user_id !== profil.id) notFound();

  const [{ data: evenements }, { data: abonnements }, pochetteUrl, audioUrl] = await Promise.all([
    supabase
      .from('release_events')
      .select('*')
      .eq('release_id', sortie.id)
      .order('created_at', { ascending: true }),
    supabase.from('subscriptions').select('statut, fin').eq('statut', 'actif'),
    lienPochette(supabase, sortie.pochette_path),
    lienAudio(supabase, sortie.audio_path),
  ]);

  const statut = statutSortie(sortie.statut);
  const modifiable = ['brouillon', 'informations_a_corriger'].includes(sortie.statut);
  const aUnAbonnement = (abonnements ?? []).some((element) => abonnementValide(element));

  return (
    <>
      <Link
        href="/espace/sorties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-marine-500 hover:text-marine-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Retour à mes sorties
      </Link>

      {messages.soumis && (
        <div className="mb-5">
          <Alerte type="succes" titre="Demande envoyée">
            Votre demande a été transmise à notre équipe. Vous pouvez suivre son avancement sur
            cette page.
          </Alerte>
        </div>
      )}
      {messages.enregistre && (
        <div className="mb-5">
          <Alerte type="succes">Votre brouillon a été enregistré.</Alerte>
        </div>
      )}

      <EntetePage
        titre={sortie.titre || 'Demande sans titre'}
        sousTitre={`${TYPES_SORTIE[sortie.type_sortie]} · ${sortie.artiste_principal || 'Artiste à renseigner'}`}
        action={<Badge ton={statut.ton}>{statut.label}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-3xl border border-marine-900/[0.06] bg-white shadow-carte">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:p-6">
              <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-marine-800 via-azur-700 to-azur-400">
                {pochetteUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pochetteUrl}
                    alt={`Pochette de ${sortie.titre}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Disc3 aria-hidden="true" className="h-10 w-10 text-white/80" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-bold text-marine-950">Informations</h2>
                <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div className="flex items-start gap-2">
                    <Music2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
                    <div>
                      <dt className="text-xs text-marine-400">Artistes invités</dt>
                      <dd className="font-medium text-marine-900">
                        {sortie.artistes_invites || 'Aucun'}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
                    <div>
                      <dt className="text-xs text-marine-400">Date de sortie souhaitée</dt>
                      <dd className="font-medium text-marine-900">
                        {dateLongue(sortie.date_sortie_souhaitee)}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Globe2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
                    <div>
                      <dt className="text-xs text-marine-400">Langue principale</dt>
                      <dd className="font-medium text-marine-900">{sortie.langue || 'Non précisée'}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
                    <div>
                      <dt className="text-xs text-marine-400">Genre</dt>
                      <dd className="font-medium text-marine-900">{sortie.genre || 'Non précisé'}</dd>
                    </div>
                  </div>
                </dl>
              </div>
            </div>

            <div className="border-t border-marine-100 p-5 sm:p-6">
              <h3 className="font-display text-base font-bold text-marine-950">Crédits</h3>
              <dl className="mt-3 space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                    Auteurs et compositeurs
                  </dt>
                  <dd className="mt-1 whitespace-pre-line leading-relaxed text-marine-700">
                    {sortie.auteurs_compositeurs || 'Non renseigné'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                    Production
                  </dt>
                  <dd className="mt-1 whitespace-pre-line leading-relaxed text-marine-700">
                    {sortie.infos_production || 'Non renseignée'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                    Autres crédits
                  </dt>
                  <dd className="mt-1 whitespace-pre-line leading-relaxed text-marine-700">
                    {sortie.credits || 'Non renseignés'}
                  </dd>
                </div>
                {sortie.liste_titres && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                      Liste des titres
                    </dt>
                    <dd className="mt-1 whitespace-pre-line leading-relaxed text-marine-700">
                      {sortie.liste_titres}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Fichiers</h2>
            <p className="mt-1 text-xs text-marine-500">
              Vos fichiers sont privés : les liens ci-dessous sont temporaires.
            </p>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-marine-100 bg-marine-50/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <FileAudio aria-hidden="true" className="h-4 w-4 text-azur-600" />
                  <div>
                    <p className="text-sm font-medium text-marine-900">Fichier audio</p>
                    <p className="text-xs text-marine-500">
                      {sortie.audio_path ? 'Fichier enregistré' : 'Non fourni'}
                    </p>
                  </div>
                </div>
                {audioUrl ? (
                  <a
                    href={audioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-azur-700 hover:underline"
                  >
                    Écouter / télécharger
                  </a>
                ) : (
                  <span className="text-xs text-marine-400">—</span>
                )}
              </div>

              {audioUrl && (
                <audio controls preload="none" src={audioUrl} className="w-full">
                  Votre navigateur ne prend pas en charge la lecture audio.
                </audio>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-marine-100 bg-marine-50/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-marine-900">Pochette</p>
                  <p className="text-xs text-marine-500">
                    {sortie.pochette_path ? 'Image enregistrée' : 'Non fournie'}
                  </p>
                </div>
                {pochetteUrl ? (
                  <a
                    href={pochetteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-azur-700 hover:underline"
                  >
                    Voir l’image
                  </a>
                ) : (
                  <span className="text-xs text-marine-400">—</span>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Avancement</h2>
            <p className="mt-1 text-sm leading-relaxed text-marine-600">{statut.description}</p>

            <div className="mt-5">
              <FriseSortie
                statut={sortie.statut}
                evenements={evenements ?? []}
                motif={sortie.motif_action}
              />
            </div>

            <div className="mt-4 rounded-2xl bg-azur-50/70 px-3.5 py-3 text-xs leading-relaxed text-azur-900">
              <p className="font-semibold">Ce qu’il vous reste à faire</p>
              <p className="mt-0.5">{actionAttendue(sortie.statut)}</p>
            </div>

            {modifiable && (
              <div className="mt-5 space-y-3">
                {!aUnAbonnement && (
                  <Alerte type="attention">
                    Votre abonnement n’est pas actif : l’envoi pour vérification sera refusé.{' '}
                    <Link href="/espace/abonnement" className="font-semibold underline">
                      Gérer mon abonnement
                    </Link>
                  </Alerte>
                )}
                <LienBouton
                  href={`/espace/sorties/${sortie.id}/modifier`}
                  variante="secondaire"
                  taille="md"
                  className="w-full"
                >
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                  Modifier ma demande
                </LienBouton>
                <BoutonSoumettreSortie id={sortie.id} />
                {sortie.statut === 'brouillon' && <BoutonSupprimerSortie id={sortie.id} />}
              </div>
            )}

            <p className="mt-4 flex items-center gap-1.5 text-[0.7rem] text-marine-400">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              Dernière modification le {dateCourte(sortie.updated_at)}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
