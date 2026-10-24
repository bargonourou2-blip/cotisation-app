'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { LienBouton } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const liens = [
  { href: '/#fonctionnement', label: 'Fonctionnement' },
  { href: '/#avantages', label: 'Avantages' },
  { href: '/#formules', label: 'Formules' },
  { href: '/#faq', label: 'FAQ' },
];

export function SiteHeader() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-marine-900/[0.06] bg-white/85 backdrop-blur-xl">
      <div className="conteneur flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
        <Logo />

        <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
          {liens.map((lien) => (
            <Link
              key={lien.href}
              href={lien.href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-marine-600 transition hover:bg-marine-50 hover:text-marine-950"
            >
              {lien.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LienBouton href="/connexion" variante="fantome" taille="md">
            Se connecter
          </LienBouton>
          <LienBouton href="/inscription" variante="principal" taille="md">
            Créer mon compte
          </LienBouton>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-marine-200 bg-white text-marine-800 lg:hidden"
          aria-expanded={ouvert}
          aria-controls="menu-mobile"
          aria-label={ouvert ? 'Fermer le menu' : 'Ouvrir le menu'}
          onClick={() => setOuvert((valeur) => !valeur)}
        >
          {ouvert ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        id="menu-mobile"
        className={cn(
          'overflow-hidden border-t border-marine-900/5 bg-white transition-all duration-300 lg:hidden',
          ouvert ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <nav aria-label="Navigation mobile" className="conteneur flex flex-col gap-1 py-4">
          {liens.map((lien) => (
            <Link
              key={lien.href}
              href={lien.href}
              onClick={() => setOuvert(false)}
              className="rounded-xl px-3 py-3 text-base font-medium text-marine-700 hover:bg-marine-50"
            >
              {lien.label}
            </Link>
          ))}
          <div className="mt-2 grid gap-2 border-t border-marine-100 pt-4">
            <LienBouton href="/connexion" variante="secondaire" taille="lg">
              Se connecter
            </LienBouton>
            <LienBouton href="/inscription" variante="principal" taille="lg">
              Créer mon compte
            </LienBouton>
          </div>
        </nav>
      </div>
    </header>
  );
}
