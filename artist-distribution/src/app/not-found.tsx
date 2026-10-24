import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

export default function PageIntrouvable() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fc] px-5 text-center">
      <Logo taille="lg" />
      <div className="mt-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-azur-600 shadow-carte">
        <Compass aria-hidden="true" className="h-7 w-7" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-extrabold text-marine-950">
        Page introuvable
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-marine-600">
        Cette page n’existe pas ou a été déplacée. Vérifiez l’adresse ou revenez à votre espace.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl bg-azur-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-azur-700"
        >
          Retour à l’accueil
        </Link>
        <Link
          href="/espace"
          className="inline-flex min-h-11 items-center rounded-xl border border-marine-200 bg-white px-5 py-2.5 text-sm font-semibold text-marine-700 hover:bg-marine-50"
        >
          Mon espace
        </Link>
      </div>
    </div>
  );
}
