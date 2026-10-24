'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CreditCard,
  Disc3,
  Home,
  Layers,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { deconnexion } from '@/actions/auth';
import { cn } from '@/lib/cn';
import { initiales } from '@/lib/format';

const liens = [
  { href: '/admin', label: 'Vue d’ensemble', icone: LayoutDashboard, exact: true },
  { href: '/admin/artistes', label: 'Artistes', icone: UsersRound },
  { href: '/admin/abonnements', label: 'Abonnements', icone: CreditCard },
  { href: '/admin/paiements', label: 'Paiements', icone: Wallet },
  { href: '/admin/sorties', label: 'Demandes', icone: Disc3 },
  { href: '/admin/formules', label: 'Formules', icone: Layers },
];

export function CoqueAdmin({
  profil,
  children,
}: {
  profil: { nom_complet: string; email: string };
  children: ReactNode;
}) {
  const chemin = usePathname();
  const estActif = (href: string, exact?: boolean) =>
    exact ? chemin === href : chemin === href || chemin.startsWith(`${href}/`);

  return (
    <div className="min-h-screen bg-[#f4f6fb] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col bg-marine-950 px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo variante="clair" />
          <p className="mt-2 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-azur-300">
            <ShieldCheck aria-hidden="true" className="h-3 w-3" />
            Administration
          </p>
        </div>

        <nav aria-label="Navigation de l’administration" className="mt-8 flex-1 space-y-1">
          {liens.map(({ href, label, icone: Icone, exact }) => {
            const actif = estActif(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  actif
                    ? 'bg-white/10 text-white ring-1 ring-inset ring-white/10'
                    : 'text-marine-300 hover:bg-white/5 hover:text-white',
                )}
              >
                <Icone aria-hidden="true" className={cn('h-[18px] w-[18px]', actif && 'text-azur-300')} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 space-y-2">
          <Link
            href="/espace"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-marine-300 transition hover:bg-white/5 hover:text-white"
          >
            <Home aria-hidden="true" className="h-4 w-4" />
            Mon espace artiste
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-azur-500 text-xs font-bold text-white">
                {initiales(profil.nom_complet)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{profil.nom_complet}</p>
                <p className="truncate text-xs text-marine-400">{profil.email}</p>
              </div>
            </div>
            <form action={deconnexion} className="mt-3">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
              >
                <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-marine-900/[0.06] bg-white/95 backdrop-blur-xl lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Logo taille="sm" />
              <span className="rounded-full bg-marine-950 px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wider text-white">
                Admin
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/espace"
                aria-label="Mon espace artiste"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-marine-200 text-marine-600"
              >
                <Home aria-hidden="true" className="h-4 w-4" />
              </Link>
              <form action={deconnexion}>
                <button
                  type="submit"
                  aria-label="Se déconnecter"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-marine-200 text-marine-500"
                >
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
          <nav
            aria-label="Navigation de l’administration (mobile)"
            className="flex gap-1 overflow-x-auto px-3 pb-2 defilement-doux"
          >
            {liens.map(({ href, label, icone: Icone, exact }) => {
              const actif = estActif(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={actif ? 'page' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                    actif ? 'bg-marine-950 text-white' : 'bg-marine-50 text-marine-600',
                  )}
                >
                  <Icone aria-hidden="true" className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
