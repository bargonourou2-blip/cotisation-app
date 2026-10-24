import Link from 'next/link';
import { ChevronLeft, FileWarning } from 'lucide-react';
import { site } from '@/config/site';

interface Props {
  titre: string;
  introduction: string;
  children: React.ReactNode;
}

export function PageLegale({ titre, introduction, children }: Props) {
  return (
    <div className="bg-white">
      <div className="conteneur max-w-4xl py-12 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-marine-500 hover:text-marine-800"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Retour à l’accueil
        </Link>

        <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight text-marine-950 sm:text-4xl">
          {titre}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-marine-600">{introduction}</p>
        <p className="mt-2 text-xs text-marine-400">
          Dernière mise à jour : {site.legal.miseAJour} · {site.legal.raisonSociale} ·{' '}
          {site.legal.pays}
        </p>

        {site.legal.documentProvisoire && (
          <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
            <FileWarning aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="leading-relaxed">
              <strong>Document provisoire.</strong> Ce texte doit être relu et complété avant le
              lancement public, notamment avec les mentions légales (identifiant d’entreprise),
              les conditions de remboursement et le nom de l’autorité de protection des données.
            </p>
          </div>
        )}

        <div className="prose prose-slate mt-10 max-w-none prose-headings:font-display prose-headings:font-bold prose-headings:text-marine-950 prose-h2:mt-10 prose-h2:text-xl prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-azur-700">
          {children}
        </div>

        <div className="mt-12 rounded-2xl bg-marine-50 px-5 py-4 text-sm text-marine-600">
          Une question sur ce document ? Écrivez-nous à{' '}
          <a href={`mailto:${site.contact.email}`} className="font-semibold text-azur-700 hover:underline">
            {site.contact.email}
          </a>
          .
        </div>
      </div>
    </div>
  );
}
