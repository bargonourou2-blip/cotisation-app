import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileAudio, ImageIcon, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { FormulaireStatutSortie } from '@/components/admin/formulaire-statut-sortie';
import { FriseSortie } from '@/components/espace/frise-sortie';
import { Badge } from '@/components/ui/badge';
import { creerClientServeur } from '@/lib/supabase/server';
import { dateHeure, dateLongue } from '@/lib/format';
import { statutSortie, TYPES_SORTIE } from '@/lib/statuts';
import { lienAudio, lienPochette } from '@/lib/storage';
import type { StatutSortie } from '@/types/database';

export const metadata: Metadata = { title: 'Détail d’une demande' };

export default async function PageSortieAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await creerClientServeur();

  const { data: sortie } = await supabase.from('releases').select('*').eq('id', id).maybeSingle();
  if (!sortie) notFound();

  const [{ data: profil }, { data: evenements }, pochetteUrl, audioUrl] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', sortie.user_id).maybeSingle(),
    supabase
      .from('release_events')
      .select('*')
      .eq('release_id', sortie.id)
      .order('created_at', { ascending: true }),
    lienPochette(supabase, sortie.pochette_path),
    lienAudio(supabase, sortie.audio_path),
  ]);

  const definition = statutSortie(sortie.statut);

  return (
    <>
      <Link
        href="/admin/sorties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-marine-500 hover:text-marine-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Retour aux demandes
      </Link>

      <EntetePage
        titre={sortie.titre || 'Demande sans titre'}
        sousTitre={`${TYPES_SORTIE[sortie.type_sortie]} · ${sortie.artiste_principal || 'Artiste non renseigné'}`}
        action={<Badge ton={definition.ton}>{definition.label}</Badge>}
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Artiste</h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-marine-50/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-marine-950">{profil?.nom_artiste ?? '—'}</p>
                <p className="text-xs text-marine-500">
                  {profil?.nom_complet} · {profil?.telephone} · {profil?.pays}
                </p>
                <a
                  href={`mailto:${profil?.email ?? ''}`}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-azur-700 hover:underline"
                >
                  <Mail aria-hidden="true" className="h-3 w-3" />
                  {profil?.email ?? '—'}
                </a>
              </div>
              {profil && (
                <Link
                  href={`/admin/artistes/${profil.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-marine-200 bg-white px-3 py-1.5 text-xs font-semibold text-marine-700 hover:bg-marine-50"
                >
                  <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
                  Fiche artiste
                </Link>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-marine-800 via-azur-700 to-azur-400">
                {pochetteUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pochetteUrl} alt="Pochette" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon aria-hidden="true" className="h-8 w-8 text-white/80" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base font-bold text-marine-950">Informations</h2>
                <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-marine-400">Artistes invités</dt>
                    <dd className="text-marine-900">{sortie.artistes_invites || 'Aucun'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-marine-400">Date de sortie souhaitée</dt>
                    <dd className="text-marine-900">{dateLongue(sortie.date_sortie_souhaitee)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-marine-400">Genre / langue</dt>
                    <dd className="text-marine-900">
                      {sortie.genre || '—'} / {sortie.langue || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-marine-400">Soumise le</dt>
                    <dd className="text-marine-900">
                      {sortie.soumis_le ? dateHeure(sortie.soumis_le) : 'Pas encore soumise'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <dl className="mt-5 space-y-4 border-t border-marine-100 pt-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                  Auteurs et compositeurs
                </dt>
                <dd className="mt-1 whitespace-pre-line text-marine-700">
                  {sortie.auteurs_compositeurs || 'Non renseigné'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                  Production
                </dt>
                <dd className="mt-1 whitespace-pre-line text-marine-700">
                  {sortie.infos_production || 'Non renseignée'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                  Autres crédits
                </dt>
                <dd className="mt-1 whitespace-pre-line text-marine-700">
                  {sortie.credits || 'Non renseignés'}
                </dd>
              </div>
              {sortie.liste_titres && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-marine-400">
                    Liste des titres
                  </dt>
                  <dd className="mt-1 whitespace-pre-line text-marine-700">{sortie.liste_titres}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Fichiers</h2>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-marine-100 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <FileAudio aria-hidden="true" className="h-4 w-4 text-azur-600" />
                  <span className="text-sm text-marine-900">
                    {sortie.audio_path ? 'Fichier audio disponible' : 'Aucun fichier audio'}
                  </span>
                </div>
                {audioUrl && (
                  <a
                    href={audioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-azur-700 hover:underline"
                  >
                    Écouter / télécharger
                  </a>
                )}
              </div>
              {audioUrl && (
                <audio controls preload="none" src={audioUrl} className="w-full">
                  Votre navigateur ne prend pas en charge la lecture audio.
                </audio>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-marine-100 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <ImageIcon aria-hidden="true" className="h-4 w-4 text-azur-600" />
                  <span className="text-sm text-marine-900">
                    {sortie.pochette_path ? 'Pochette disponible' : 'Aucune pochette'}
                  </span>
                </div>
                {pochetteUrl && (
                  <a
                    href={pochetteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-azur-700 hover:underline"
                  >
                    Voir l’image
                  </a>
                )}
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-marine-400">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              Liens signés temporaires · accès réservé à l’artiste et à l’administration.
            </p>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Traiter la demande</h2>
            <div className="mt-3">
              <FormulaireStatutSortie
                sortieId={sortie.id}
                statutActuel={sortie.statut as StatutSortie}
                motifActuel={sortie.motif_action}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Suivi</h2>
            <div className="mt-4">
              <FriseSortie
                statut={sortie.statut}
                evenements={evenements ?? []}
                motif={sortie.motif_action}
              />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
