import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EtatVideProps {
  icone: ReactNode;
  titre: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EtatVide({ icone, titre, description, action, className }: EtatVideProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-3xl border border-dashed border-marine-200 bg-marine-50/40 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-azur-600 shadow-sm ring-1 ring-marine-900/5">
        {icone}
      </div>
      <h3 className="font-display text-lg font-bold text-marine-950">{titre}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-marine-600">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
