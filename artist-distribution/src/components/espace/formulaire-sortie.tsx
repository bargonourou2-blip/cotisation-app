'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, FileAudio, ImageIcon, Info, Loader2, Save, Send } from 'lucide-react';
import { enregistrerFichiers, enregistrerSortie, soumettreSortie } from '@/actions/sorties';
import { Alerte } from '@/components/ui/alerte';
import { Bouton } from '@/components/ui/button';
import { Champ, Input, Select, Textarea } from '@/components/ui/champs';
import { aujourdHuiIso, tailleFichier } from '@/lib/format';
import {
  nomFichierPropre,
  TAILLE_MAX_AUDIO,
  televerserFichier,
  verifierAudio,
  verifierPochette,
} from '@/lib/televersement';
import { TYPES_SORTIE } from '@/lib/statuts';
import { cn } from '@/lib/cn';
import type { Sortie, TypeSortie } from '@/types/database';

type Etape = 'repos' | 'enregistrement' | 'televersement' | 'soumission';

interface Props {
  userId: string;
  sortie?: Sortie;
  pochetteUrl?: string | null;
  audioUrl?: string | null;
}

const libellesEtapes: Record<Exclude<Etape, 'repos'>, string> = {
  enregistrement: 'Enregistrement des informations…',
  televersement: 'Envoi des fichiers…',
  soumission: 'Envoi pour vérification…',
};

export function FormulaireSortie({ userId, sortie, pochetteUrl, audioUrl }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [etape, setEtape] = useState<Etape>('repos');
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [erreursChamps, setErreursChamps] = useState<Record<string, string>>({});
  const [pochette, setPochette] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [typeSortie, setTypeSortie] = useState<TypeSortie>(sortie?.type_sortie ?? 'single');

  const enCours = etape !== 'repos';

  useEffect(() => {
    if (!pochette) {
      setApercu(null);
      return;
    }
    const url = URL.createObjectURL(pochette);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [pochette]);

  function choisirPochette(fichier: File | null) {
    setErreursChamps((actuel) => ({ ...actuel, pochette: '' }));
    if (!fichier) {
      setPochette(null);
      return;
    }
    const erreur = verifierPochette(fichier);
    if (erreur) {
      setErreurGlobale(erreur);
      setPochette(null);
      return;
    }
    setErreurGlobale(null);
    setPochette(fichier);
  }

  function choisirAudio(fichier: File | null) {
    setErreursChamps((actuel) => ({ ...actuel, audio: '' }));
    if (!fichier) {
      setAudio(null);
      return;
    }
    const erreur = verifierAudio(fichier);
    if (erreur) {
      setErreurGlobale(erreur);
      setAudio(null);
      return;
    }
    setErreurGlobale(null);
    setAudio(fichier);
  }

  async function envoyer(intention: 'brouillon' | 'soumettre') {
    const formulaire = formRef.current;
    if (!formulaire || enCours) return;

    setErreurGlobale(null);
    setErreursChamps({});

    if (!formulaire.reportValidity()) return;

    if (intention === 'soumettre') {
      if (!pochette && !sortie?.pochette_path) {
        setErreurGlobale('Ajoutez une pochette avant de soumettre votre demande.');
        return;
      }
      if (!audio && !sortie?.audio_path) {
        setErreurGlobale('Ajoutez le fichier audio avant de soumettre votre demande.');
        return;
      }
    }

    const donnees = new FormData(formulaire);
    donnees.set('sortie_id', sortie?.id ?? '');

    setEtape('enregistrement');
    const resultat = await enregistrerSortie(donnees);

    if (!resultat.ok || !resultat.id) {
      setEtape('repos');
      setErreurGlobale(resultat.message ?? 'L’enregistrement a échoué.');
      setErreursChamps(resultat.erreursChamps ?? {});
      return;
    }

    const identifiant = resultat.id;
    let pochettePath: string | undefined;
    let audioPath: string | undefined;

    if (pochette || audio) {
      setEtape('televersement');

      if (pochette) {
        const ext = pochette.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const chemin = `${userId}/${identifiant}/pochette.${nomFichierPropre(ext)}`;
        const envoi = await televerserFichier({ bucket: 'pochettes', chemin, fichier: pochette });
        if (!envoi.ok) {
          setEtape('repos');
          setErreurGlobale(
            `${envoi.erreur ?? 'La pochette n’a pas pu être envoyée.'} Votre brouillon a été enregistré, vous pourrez réessayer.`,
          );
          return;
        }
        pochettePath = chemin;
      }

      if (audio) {
        const ext = audio.name.split('.').pop()?.toLowerCase() ?? 'mp3';
        const chemin = `${userId}/${identifiant}/audio.${nomFichierPropre(ext)}`;
        const envoi = await televerserFichier({ bucket: 'audios', chemin, fichier: audio });
        if (!envoi.ok) {
          setEtape('repos');
          setErreurGlobale(
            `${envoi.erreur ?? 'Le fichier audio n’a pas pu être envoyé.'} Votre brouillon a été enregistré, vous pourrez réessayer.`,
          );
          return;
        }
        audioPath = chemin;
      }

      const maj = await enregistrerFichiers({ id: identifiant, pochettePath, audioPath });
      if (!maj.ok) {
        setEtape('repos');
        setErreurGlobale(maj.message ?? 'Les fichiers n’ont pas pu être enregistrés.');
        return;
      }
    }

    if (intention === 'soumettre') {
      setEtape('soumission');
      const envoi = await soumettreSortie(identifiant);
      if (!envoi.ok) {
        setEtape('repos');
        setErreurGlobale(envoi.message ?? 'La soumission a échoué.');
        return;
      }
      router.push(`/espace/sorties/${identifiant}?soumis=1`);
      return;
    }

    router.push(`/espace/sorties/${identifiant}?enregistre=1`);
  }

  const erreur = (champ: string) => erreursChamps[champ] || undefined;

  return (
    <form ref={formRef} className="space-y-5" noValidate>
      {erreurGlobale && (
        <Alerte type="erreur" titre="Action impossible">
          {erreurGlobale}
        </Alerte>
      )}

      <div className="flex gap-2.5 rounded-2xl border border-azur-200/70 bg-azur-50/60 px-4 py-3 text-xs leading-relaxed text-azur-900">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Cette étape est indépendante de votre compte : vous pouvez enregistrer un brouillon
          incomplet et revenir plus tard. Vos fichiers restent privés.
        </p>
      </div>

      <fieldset disabled={enCours} className="space-y-5">
        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
              1
            </span>
            <h2 className="font-display text-lg font-bold text-marine-950">Informations principales</h2>
          </div>

          <div className="space-y-4">
            <Champ id="titre" label="Titre de la musique ou de l’album" requis erreur={erreur('titre')}>
              <Input
                id="titre"
                name="titre"
                defaultValue={sortie?.titre ?? ''}
                placeholder="Ex. Demain sera meilleur"
                maxLength={160}
                required
                erreur={Boolean(erreur('titre'))}
              />
            </Champ>

            <div className="grid gap-4 sm:grid-cols-2">
              <Champ id="type_sortie" label="Type de sortie" requis erreur={erreur('type_sortie')}>
                <Select
                  id="type_sortie"
                  name="type_sortie"
                  value={typeSortie}
                  onChange={(evenement) => setTypeSortie(evenement.target.value as TypeSortie)}
                  erreur={Boolean(erreur('type_sortie'))}
                >
                  {Object.entries(TYPES_SORTIE).map(([valeur, label]) => (
                    <option key={valeur} value={valeur}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Champ>

              <Champ
                id="artiste_principal"
                label="Nom de l’artiste principal"
                requis
                erreur={erreur('artiste_principal')}
              >
                <Input
                  id="artiste_principal"
                  name="artiste_principal"
                  defaultValue={sortie?.artiste_principal ?? ''}
                  maxLength={160}
                  required
                  erreur={Boolean(erreur('artiste_principal'))}
                />
              </Champ>
            </div>

            <Champ
              id="artistes_invites"
              label="Artistes invités"
              aide="Séparez les noms par des virgules."
              erreur={erreur('artistes_invites')}
            >
              <Input
                id="artistes_invites"
                name="artistes_invites"
                defaultValue={sortie?.artistes_invites ?? ''}
                maxLength={500}
                erreur={Boolean(erreur('artistes_invites'))}
              />
            </Champ>

            {typeSortie !== 'single' && (
              <Champ
                id="liste_titres"
                label="Liste des titres"
                requis
                aide="Un titre par ligne, dans l’ordre de la sortie."
                erreur={erreur('liste_titres')}
              >
                <Textarea
                  id="liste_titres"
                  name="liste_titres"
                  defaultValue={sortie?.liste_titres ?? ''}
                  rows={5}
                  placeholder={'1. Premier titre\n2. Deuxième titre'}
                  erreur={Boolean(erreur('liste_titres'))}
                />
              </Champ>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
              2
            </span>
            <h2 className="font-display text-lg font-bold text-marine-950">Sortie et style musical</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              id="date_sortie_souhaitee"
              label="Date de sortie souhaitée"
              aide="Choisissez une date future. Elle sera confirmée avec notre équipe."
              erreur={erreur('date_sortie_souhaitee')}
            >
              <Input
                id="date_sortie_souhaitee"
                name="date_sortie_souhaitee"
                type="date"
                min={aujourdHuiIso()}
                defaultValue={sortie?.date_sortie_souhaitee ?? ''}
                erreur={Boolean(erreur('date_sortie_souhaitee'))}
              />
            </Champ>

            <Champ id="genre" label="Genre musical" erreur={erreur('genre')}>
              <Input
                id="genre"
                name="genre"
                defaultValue={sortie?.genre ?? ''}
                placeholder="Afropop, rap, gospel, coupé-décalé…"
                maxLength={80}
                erreur={Boolean(erreur('genre'))}
              />
            </Champ>
          </div>

          <div className="mt-4">
            <Champ id="langue" label="Langue principale" erreur={erreur('langue')}>
              <Input
                id="langue"
                name="langue"
                defaultValue={sortie?.langue ?? ''}
                placeholder="Français, mooré, dioula, anglais…"
                maxLength={80}
                erreur={Boolean(erreur('langue'))}
              />
            </Champ>
          </div>
        </section>

        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
              3
            </span>
            <h2 className="font-display text-lg font-bold text-marine-950">Crédits et production</h2>
          </div>

          <div className="space-y-4">
            <Champ
              id="auteurs_compositeurs"
              label="Auteurs et compositeurs"
              requis
              aide="Noms complets et rôle de chacun (parolier, compositeur, arrangeur…)."
              erreur={erreur('auteurs_compositeurs')}
            >
              <Textarea
                id="auteurs_compositeurs"
                name="auteurs_compositeurs"
                defaultValue={sortie?.auteurs_compositeurs ?? ''}
                rows={4}
                placeholder="Ex. Awa Traoré (paroles), Ibrahim Sawadogo (musique)"
                erreur={Boolean(erreur('auteurs_compositeurs'))}
              />
            </Champ>

            <Champ
              id="infos_production"
              label="Informations de production"
              aide="Studio, producteur, année d’enregistrement, lieu…"
              erreur={erreur('infos_production')}
            >
              <Textarea
                id="infos_production"
                name="infos_production"
                defaultValue={sortie?.infos_production ?? ''}
                rows={3}
                placeholder="Ex. Enregistré au studio X à Ouagadougou, produit par…"
                erreur={Boolean(erreur('infos_production'))}
              />
            </Champ>

            <Champ
              id="credits"
              label="Autres crédits"
              aide="Musiciens, chœurs, ingénieur du son, beatmaker…"
              erreur={erreur('credits')}
            >
              <Textarea
                id="credits"
                name="credits"
                defaultValue={sortie?.credits ?? ''}
                rows={3}
                erreur={Boolean(erreur('credits'))}
              />
            </Champ>
          </div>
        </section>

        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
              4
            </span>
            <h2 className="font-display text-lg font-bold text-marine-950">Pochette et fichier audio</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-marine-200 p-4">
              <div className="flex items-center gap-2">
                <ImageIcon aria-hidden="true" className="h-4 w-4 text-azur-600" />
                <p className="text-sm font-semibold text-marine-900">Pochette</p>
              </div>
              <p className="mt-1 text-xs text-marine-500">JPG, PNG ou WebP · 10 Mo maximum.</p>

              {apercu && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={apercu}
                  alt="Aperçu de la pochette"
                  className="mt-3 h-28 w-28 rounded-xl object-cover shadow-sm"
                />
              )}
              {!apercu && pochetteUrl && (
                <div className="mt-3 flex items-center gap-2 text-xs text-marine-600">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pochetteUrl}
                    alt="Pochette déjà envoyée"
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <span className="flex items-center gap-1">
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
                    Pochette enregistrée
                  </span>
                </div>
              )}

              <input
                type="file"
                id="pochette"
                name="pochette"
                accept="image/jpeg,image/png,image/webp"
                onChange={(evenement) => choisirPochette(evenement.target.files?.[0] ?? null)}
                className="mt-3 block w-full text-sm text-marine-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-azur-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-azur-700 hover:file:bg-azur-100"
              />
              {pochette && (
                <p className="mt-2 truncate text-xs text-marine-500">
                  {pochette.name} · {tailleFichier(pochette.size)}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-marine-200 p-4">
              <div className="flex items-center gap-2">
                <FileAudio aria-hidden="true" className="h-4 w-4 text-azur-600" />
                <p className="text-sm font-semibold text-marine-900">Fichier audio</p>
              </div>
              <p className="mt-1 text-xs text-marine-500">
                MP3, WAV, FLAC, M4A, AIFF ou OGG · {tailleFichier(TAILLE_MAX_AUDIO)} maximum.
              </p>

              {audioUrl && !audio && (
                <audio controls preload="none" src={audioUrl} className="mt-3 w-full">
                  Votre navigateur ne prend pas en charge la lecture audio.
                </audio>
              )}

              <input
                type="file"
                id="audio"
                name="audio"
                accept=".mp3,.wav,.flac,.m4a,.aiff,.aif,.ogg,audio/*"
                onChange={(evenement) => choisirAudio(evenement.target.files?.[0] ?? null)}
                className="mt-3 block w-full text-sm text-marine-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-azur-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-azur-700 hover:file:bg-azur-100"
              />
              {audio && (
                <p className="mt-2 truncate text-xs text-marine-500">
                  {audio.name} · {tailleFichier(audio.size)}
                </p>
              )}
              {!audio && sortie?.audio_path && (
                <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  Un fichier audio est déjà enregistré.
                </p>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-marine-500">
            Les fichiers envoyés restent privés. Ils ne sont visibles que par vous et l’équipe de
            distribution.
          </p>
        </section>

        <div className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <div className="flex items-start gap-2.5 text-xs leading-relaxed text-marine-600">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>
              Pour <strong>soumettre</strong> la demande, il faut : un titre, l’artiste principal,
              les auteurs et compositeurs, une date de sortie future, la pochette et le fichier
              audio. Pour un EP ou un album, la liste des titres est également nécessaire.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse sm:items-center">
            <Bouton
              type="button"
              onClick={() => envoyer('soumettre')}
              taille="lg"
              disabled={enCours}
              className="w-full sm:w-auto"
            >
              {etape === 'soumission' ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Send aria-hidden="true" className="h-4 w-4" />
              )}
              Soumettre pour vérification
            </Bouton>
            <Bouton
              type="button"
              variante="secondaire"
              onClick={() => envoyer('brouillon')}
              taille="lg"
              disabled={enCours}
              className="w-full sm:w-auto"
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              Enregistrer le brouillon
            </Bouton>

            <p
              className={cn(
                'flex items-center gap-2 text-xs text-marine-500 sm:mr-auto',
                !enCours && 'hidden sm:flex',
              )}
              aria-live="polite"
            >
              {enCours && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
              {etape === 'repos' ? 'Vous pourrez revenir plus tard.' : libellesEtapes[etape]}
            </p>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
