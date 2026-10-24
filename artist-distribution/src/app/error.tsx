'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';

export default function Erreur({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fc] px-5 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <CircleAlert aria-hidden="true" className="h-7 w-7" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-extrabold text-marine-950">
        Une erreur est survenue
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-marine-600">
        Nous n’avons pas pu afficher cette page. Vous pouvez réessayer ou revenir à l’accueil. Si le
        problème persiste, contactez notre équipe.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-xl bg-azur-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-azur-700"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl border border-marine-200 bg-white px-5 py-2.5 text-sm font-semibold text-marine-700 hover:bg-marine-50"
        >
          Retour à l’accueil
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-marine-400">Référence : {error.digest}</p>}
    </div>
  );
}
