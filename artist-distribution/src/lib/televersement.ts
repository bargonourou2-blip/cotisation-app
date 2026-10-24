'use client';

import { getClientNavigateur } from '@/lib/supabase/client';

/** Extensions acceptées (vérifiées côté navigateur ET côté Supabase Storage). */
const IMAGES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const AUDIOS: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/x-m4a',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  ogg: 'audio/ogg',
};

export const TAILLE_MAX_IMAGE = 10 * 1024 * 1024; // 10 Mo
export const TAILLE_MAX_AUDIO = 200 * 1024 * 1024; // 200 Mo

function extension(nom: string): string {
  return (nom.split('.').pop() ?? '').toLowerCase();
}

export function verifierPochette(fichier: File): string | null {
  const ext = extension(fichier.name);
  if (!IMAGES[ext]) return 'Format d’image non accepté. Utilisez JPG, PNG ou WebP.';
  if (fichier.size > TAILLE_MAX_IMAGE) return 'La pochette ne doit pas dépasser 10 Mo.';
  if (fichier.size === 0) return 'Le fichier sélectionné est vide.';
  return null;
}

export function verifierAudio(fichier: File): string | null {
  const ext = extension(fichier.name);
  if (!AUDIOS[ext]) return 'Format audio non accepté. Utilisez MP3, WAV, FLAC, M4A, AIFF ou OGG.';
  if (fichier.size > TAILLE_MAX_AUDIO) return 'Le fichier audio ne doit pas dépasser 200 Mo.';
  if (fichier.size === 0) return 'Le fichier sélectionné est vide.';
  return null;
}

export function nomFichierPropre(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(-80);
}

export interface ResultatTeleversement {
  ok: boolean;
  chemin?: string;
  erreur?: string;
}

/** Envoie un fichier vers le bucket privé Supabase. */
export async function televerserFichier(options: {
  bucket: 'pochettes' | 'audios';
  chemin: string;
  fichier: File;
}): Promise<ResultatTeleversement> {
  const { bucket, chemin, fichier } = options;
  const ext = extension(fichier.name);
  const contentType = bucket === 'pochettes' ? IMAGES[ext] : AUDIOS[ext];

  if (!contentType) {
    return { ok: false, erreur: 'Format de fichier non accepté.' };
  }

  try {
    const supabase = getClientNavigateur();
    const { error } = await supabase.storage.from(bucket).upload(chemin, fichier, {
      upsert: true,
      contentType,
      cacheControl: '3600',
    });

    if (error) {
      console.error('Téléversement :', error.message);
      const message = error.message.toLowerCase().includes('exceeded')
        ? 'Le fichier dépasse la taille maximale autorisée par le stockage. Contactez-nous.'
        : 'Le fichier n’a pas pu être envoyé. Vérifiez votre connexion et réessayez.';
      return { ok: false, erreur: message };
    }

    return { ok: true, chemin };
  } catch (erreur) {
    console.error('Téléversement :', erreur);
    return { ok: false, erreur: 'Le fichier n’a pas pu être envoyé. Réessayez dans un instant.' };
  }
}
