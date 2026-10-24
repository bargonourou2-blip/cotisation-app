import type { ReactNode } from 'react';

interface EnteteAuthProps {
  titre: string;
  sousTitre?: ReactNode;
}

export function EnteteAuth({ titre, sousTitre }: EnteteAuthProps) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-marine-950 sm:text-3xl">
        {titre}
      </h1>
      {sousTitre && <p className="mt-2 text-sm leading-relaxed text-marine-600">{sousTitre}</p>}
    </div>
  );
}
