import Link from 'next/link';
import { cn } from '@/lib/cn';
import { site } from '@/config/site';

interface LogoProps {
  /** `clair` = texte blanc (fonds sombres). */
  variante?: 'sombre' | 'clair';
  avecTexte?: boolean;
  className?: string;
  href?: string | null;
  taille?: 'sm' | 'md' | 'lg';
}

const tailles = {
  sm: { carre: 'h-9 w-9', texte: 'text-[0.95rem]', barre: 'w-[2.5px]' },
  md: { carre: 'h-10 w-10', texte: 'text-base', barre: 'w-[3px]' },
  lg: { carre: 'h-12 w-12', texte: 'text-lg', barre: 'w-[3.5px]' },
};

const hauteursBarres = ['38%', '62%', '100%', '52%', '78%'];

/**
 * Logo du service.
 * Pour utiliser une image, renseignez `site.logo.image` dans src/config/site.ts.
 */
export function Logo({
  variante = 'sombre',
  avecTexte = true,
  className,
  href = '/',
  taille = 'md',
}: LogoProps) {
  const t = tailles[taille];
  const mots = site.nom.split(' ');
  const premier = mots.length > 1 ? mots.slice(0, -1).join(' ') : '';
  const dernier = mots[mots.length - 1];

  const marque = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {site.logo.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={site.logo.image} alt={site.nom} className={cn('w-auto', t.carre)} />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex items-center justify-center rounded-[0.85rem] bg-gradient-to-br from-azur-400 via-azur-500 to-marine-800 shadow-lg shadow-azur-900/20',
            t.carre,
          )}
        >
          <span className="flex h-1/2 items-end gap-[3px]">
            {hauteursBarres.map((hauteur, index) => (
              <span
                key={index}
                className={cn('rounded-full bg-white', t.barre)}
                style={{ height: hauteur, opacity: 0.65 + index * 0.07 }}
              />
            ))}
          </span>
        </span>
      )}
      {avecTexte && (
        <span className={cn('font-display font-extrabold leading-none tracking-tight', t.texte)}>
          <span className={variante === 'clair' ? 'text-white' : 'text-marine-950'}>
            {premier ? `${premier} ` : ''}
          </span>
          <span className={variante === 'clair' ? 'text-azur-300' : 'text-azur-600'}>{dernier}</span>
        </span>
      )}
    </span>
  );

  if (!href) return marque;

  return (
    <Link href={href} aria-label={`${site.nom} — accueil`} className="inline-flex rounded-lg">
      {marque}
    </Link>
  );
}
