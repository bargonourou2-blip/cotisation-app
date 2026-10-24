import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export type VarianteBouton = 'principal' | 'secondaire' | 'fantome' | 'clair' | 'danger' | 'succes';
export type TailleBouton = 'sm' | 'md' | 'lg';

const variantes: Record<VarianteBouton, string> = {
  principal:
    'bg-azur-600 text-white shadow-lg shadow-azur-900/15 hover:bg-azur-700 active:bg-azur-800',
  secondaire:
    'border border-marine-200 bg-white text-marine-800 shadow-sm hover:border-marine-300 hover:bg-marine-50',
  fantome: 'text-marine-700 hover:bg-marine-100/70',
  clair: 'bg-white text-marine-950 shadow-lg shadow-marine-950/20 hover:bg-azur-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  succes: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
};

const tailles: Record<TailleBouton, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-sm',
  md: 'min-h-11 px-5 py-2.5 text-sm',
  lg: 'min-h-12 px-6 py-3 text-base',
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azur-500 focus-visible:ring-offset-2';

export function boutonClasses(variante: VarianteBouton = 'principal', taille: TailleBouton = 'md') {
  return cn(base, variantes[variante], tailles[taille]);
}

type BoutonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBouton;
  taille?: TailleBouton;
};

export function Bouton({ variante = 'principal', taille = 'md', className, ...props }: BoutonProps) {
  return <button className={cn(boutonClasses(variante, taille), className)} {...props} />;
}

type LienBoutonProps = ComponentProps<typeof Link> & {
  variante?: VarianteBouton;
  taille?: TailleBouton;
};

export function LienBouton({
  variante = 'principal',
  taille = 'md',
  className,
  ...props
}: LienBoutonProps) {
  return <Link className={cn(boutonClasses(variante, taille), className)} {...props} />;
}
