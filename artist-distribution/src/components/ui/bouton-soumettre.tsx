'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { type TailleBouton, type VarianteBouton, boutonClasses } from '@/components/ui/button';

interface BoutonSoumettreProps {
  children: React.ReactNode;
  enCours?: string;
  variante?: VarianteBouton;
  taille?: TailleBouton;
  className?: string;
  disabled?: boolean;
  /** Utilise formAction pour les formulaires à plusieurs boutons. */
  formAction?: (formData: FormData) => void | Promise<void>;
  name?: string;
  value?: string;
}

/** Bouton qui affiche un indicateur pendant l'envoi du formulaire. */
export function BoutonSoumettre({
  children,
  enCours = 'Envoi…',
  variante = 'principal',
  taille = 'md',
  className,
  disabled,
  formAction,
  name,
  value,
}: BoutonSoumettreProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(boutonClasses(variante, taille), className)}
      formAction={formAction}
      name={name}
      value={value}
      aria-busy={pending}
    >
      {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
      {pending ? enCours : children}
    </button>
  );
}
