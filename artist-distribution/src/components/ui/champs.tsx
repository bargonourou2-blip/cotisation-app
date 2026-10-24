import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

interface ChampProps {
  id: string;
  label: string;
  requis?: boolean;
  aide?: string;
  erreur?: string;
  children: ReactNode;
  className?: string;
}

export function Champ({ id, label, requis, aide, erreur, children, className }: ChampProps) {
  return (
    <div className={cn('space-y-0', className)}>
      <label htmlFor={id} className="etiquette">
        {label}
        {requis ? (
          <span className="ml-0.5 text-azur-600" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-marine-400">(facultatif)</span>
        )}
      </label>
      {children}
      {erreur ? (
        <p id={`${id}-erreur`} className="erreur-champ">
          {erreur}
        </p>
      ) : aide ? (
        <p id={`${id}-aide`} className="aide-champ">
          {aide}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  erreur?: boolean;
}

export function Input({ className, erreur, ...props }: InputProps) {
  return (
    <input
      className={cn('champ', erreur && 'border-red-300 focus:border-red-500 focus:ring-red-500/15', className)}
      aria-invalid={erreur || undefined}
      {...props}
    />
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  erreur?: boolean;
}

export function Textarea({ className, erreur, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'champ min-h-[110px] resize-y leading-relaxed',
        erreur && 'border-red-300 focus:border-red-500 focus:ring-red-500/15',
        className,
      )}
      aria-invalid={erreur || undefined}
      {...props}
    />
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  erreur?: boolean;
  children: ReactNode;
}

export function Select({ className, erreur, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'champ pr-10',
        erreur && 'border-red-300 focus:border-red-500 focus:ring-red-500/15',
        className,
      )}
      aria-invalid={erreur || undefined}
      {...props}
    >
      {children}
    </select>
  );
}

interface CaseProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  erreur?: string;
}

export function CaseACocher({ label, erreur, className, id, ...props }: CaseProps) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className={cn(
            'mt-0.5 h-5 w-5 shrink-0 rounded border-marine-300 text-azur-600 focus:ring-azur-500/30',
            className,
          )}
          aria-invalid={Boolean(erreur) || undefined}
          {...props}
        />
        <label htmlFor={id} className="text-sm leading-relaxed text-marine-700">
          {label}
        </label>
      </div>
      {erreur && <p className="erreur-champ ml-8">{erreur}</p>}
    </div>
  );
}
