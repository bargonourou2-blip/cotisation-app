import { plateformes } from '@/config/site';

export function BandeauPlateformes() {
  return (
    <section aria-label="Plateformes de diffusion" className="border-b border-marine-900/[0.06] bg-white">
      <div className="conteneur py-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-marine-400">
          Nous préparons vos sorties pour les principales plateformes
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {plateformes.map((nom) => (
            <span
              key={nom}
              className="font-display text-base font-bold text-marine-400 transition hover:text-marine-600 sm:text-lg"
            >
              {nom}
            </span>
          ))}
        </div>
        <p className="mt-4 text-center text-[0.7rem] text-marine-400">
          La disponibilité et les délais dépendent de la validation de chaque plateforme.
        </p>
      </div>
    </section>
  );
}
