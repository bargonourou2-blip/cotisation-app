/** Formatage des montants, dates et durées (français, Afrique de l'Ouest). */

const FUSEAU = 'Africa/Ouagadougou';

/** 13500 → « 13 500 FCFA » */
export function fcfa(montant: number): string {
  const valeur = Number.isFinite(montant) ? montant : 0;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(valeur)} FCFA`;
}

/** « 24 octobre 2026 » */
export function dateLongue(valeur: string | Date | null | undefined): string {
  if (!valeur) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: FUSEAU,
  }).format(new Date(valeur));
}

/** « 24/10/2026 » */
export function dateCourte(valeur: string | Date | null | undefined): string {
  if (!valeur) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: FUSEAU,
  }).format(new Date(valeur));
}

/** « 24/10/2026 à 14:30 » */
export function dateHeure(valeur: string | Date | null | undefined): string {
  if (!valeur) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSEAU,
  }).format(new Date(valeur));
}

/** « 30 jours » / « 1 an » */
export function duree(jours: number): string {
  if (jours % 365 === 0) {
    const annees = jours / 365;
    return annees === 1 ? '1 an' : `${annees} ans`;
  }
  if (jours % 30 === 0) {
    const mois = jours / 30;
    return mois === 1 ? '1 mois' : `${mois} mois`;
  }
  return jours === 1 ? '1 jour' : `${jours} jours`;
}

/** Nombre de jours restants (arrondi au supérieur), 0 si échu. */
export function joursRestants(fin: string | null): number {
  if (!fin) return 0;
  const difference = new Date(fin).getTime() - Date.now();
  return Math.max(0, Math.ceil(difference / (1000 * 60 * 60 * 24)));
}

/** Taille de fichier lisible : « 4,2 Mo » */
export function tailleFichier(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1).replace('.', ',')} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Initiales pour les avatars : « Ezéchiel Bargo » → « EB » */
export function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? '')
    .join('');
}

/** Date du jour au format AAAA-MM-JJ (fuseau de Ouagadougou). */
export function aujourdHuiIso(): string {
  const maintenant = new Date();
  const decalage = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(maintenant);
  return decalage;
}
