'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CreditCard,
  Disc3,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { deconnexion } from '@/actions/auth';
import { cn } from '@/lib/cn';
import { initiales } from '@/lib/format';

interface ProfilResume {
  nom_complet: string;
  nom_artiste: string;
  email: string;
  role: string;
}

const liens = [
  { href: '/espace', label: 'Tableau de bord', icone: LayoutDashboard, exact: true },
  { href: '/espace/sorties', label: 'Mes sorties', icone: Disc3 },
  { href: '/espace/abonnement', label: 'Abonnement', icone: CreditCard },
  { href: '/espace/profil', label: 'Mon profil', icone: UserRound },
];

export function CoqueEspace({
  profil,
  children,
}: {
  profil: ProfilResume;
  children: ReactNode;
}) {
  const chemin = usePathname();
  const estActif = (href: string, exact?: boolean) =>
    exact ? chemin === href : chemin === href || chemin.startsWith(`${href}/`);

  const liensAffiches =
    profil.role === 'admin'
      ? [...liens, { href: '/admin', label: 'Administration', icone: ShieldCheck, exact: false }]
      : liens;

  return (
    <div className="min-h-screen bg-[#f6f8fc] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-marine-900/[0.06] bg-white px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo />
        </div>

        <nav aria-label="Navigation de l’espace artiste" className="mt-8 flex-1 space-y-1">
          {liensAffiches.map(({ href, label, icone: Icone, exact }) => {
            const actif = estActif(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={actif ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  actif
                    ? 'bg-azur-50 text-azur-800 ring-1 ring-inset ring-azur-600/10'
                    : 'text-marine-600 hover:bg-marine-50 hover:text-marine-900',
                )}
              >
                <Icone aria-hidden="true" className={cn('h-[18px] w-[18px]', actif && 'text-azur-600')} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-2xl border border-marine-900/[0.06] bg-marine-50/70 p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marine-950 text-xs font-bold text-white">
              {initiales(profil.nom_artiste || profil.nom_complet)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-marine-950">{profil.nom_artiste}</p>
              <p className="truncate text-xs text-marine-500">{profil.email}</p>
            </div>
          </div>
          <form action={deconnexion} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-marine-200 bg-white px-3 py-2 text-xs font-semibold text-marine-700 transition hover:bg-marine-100"
            >
              <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-marine-900/[0.06] bg-white/90 backdrop-blur-xl lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Logo taille="sm" />
            <div className="flex items-center gap-2">
              <Link
                href="/espace/profil"
                aria-label="Mon profil"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-marine-950 text-[0.7rem] font-bold text-white"
              >
                {initiales(profil.nom_artiste || profil.nom_complet)}
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
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          {children}
        </main>

        <nav
          aria-label="Navigation mobile"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-marine-900/[0.08] bg-white/95 backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto grid max-w-lg grid-cols-4">
            {liens.map(({ href, label, icone: Icone, exact }) => {
              const actif = estActif(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={actif ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.65rem] font-medium',
                    actif ? 'text-azur-700' : 'text-marine-500',
                  )}
                >
                  <Icone aria-hidden="true" className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
