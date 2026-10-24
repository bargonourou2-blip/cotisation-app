import type { ReactNode } from 'react';

interface EntetePageProps {
  titre: string;
  sousTitre?: string;
  action?: ReactNode;
}

export function EntetePage({ titre, sousTitre, action }: EntetePageProps) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-marine-950 sm:text-3xl">
          {titre}
        </h1>
        {sousTitre && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-marine-600">{sousTitre}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
