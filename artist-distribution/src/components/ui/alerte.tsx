import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

type TypeAlerte = 'info' | 'succes' | 'attention' | 'erreur';

const styles: Record<TypeAlerte, { boite: string; icone: typeof Info }> = {
  info: { boite: 'border-azur-200 bg-azur-50/80 text-azur-900', icone: Info },
  succes: { boite: 'border-emerald-200 bg-emerald-50/80 text-emerald-900', icone: CircleCheck },
  attention: { boite: 'border-amber-200 bg-amber-50/80 text-amber-900', icone: TriangleAlert },
  erreur: { boite: 'border-red-200 bg-red-50/80 text-red-900', icone: CircleAlert },
};

interface AlerteProps {
  type?: TypeAlerte;
  titre?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Alerte({ type = 'info', titre, children, className }: AlerteProps) {
  const { boite, icone: Icone } = styles[type];
  return (
    <div
      role={type === 'erreur' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-2xl border px-4 py-3.5 text-sm', boite, className)}
    >
      <Icone aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-1">
        {titre && <p className="font-semibold">{titre}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}
