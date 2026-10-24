import { cn } from '@/lib/cn';
import type { Ton } from '@/lib/statuts';

const tons: Record<Ton, { badge: string; point: string }> = {
  neutre: { badge: 'bg-marine-100 text-marine-700 ring-marine-900/10', point: 'bg-marine-400' },
  info: { badge: 'bg-azur-50 text-azur-800 ring-azur-600/15', point: 'bg-azur-500' },
  attention: { badge: 'bg-amber-50 text-amber-800 ring-amber-600/20', point: 'bg-amber-500' },
  succes: { badge: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', point: 'bg-emerald-500' },
  erreur: { badge: 'bg-red-50 text-red-700 ring-red-600/20', point: 'bg-red-500' },
  violet: { badge: 'bg-violet-50 text-violet-800 ring-violet-600/20', point: 'bg-violet-500' },
};

interface BadgeProps {
  children: React.ReactNode;
  ton?: Ton;
  point?: boolean;
  className?: string;
}

export function Badge({ children, ton = 'neutre', point = true, className }: BadgeProps) {
  const style = tons[ton];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        style.badge,
        className,
      )}
    >
      {point && <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', style.point)} />}
      {children}
    </span>
  );
}
