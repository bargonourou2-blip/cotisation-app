import Link from 'next/link';
import { Mail, MapPin, MessageCircle, Clock } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { site } from '@/config/site';

const annee = new Date().getFullYear();

export function SiteFooter() {
  const { contact, reseauxSociaux } = site;
  const reseaux = Object.entries(reseauxSociaux).filter(([, url]) => Boolean(url));

  return (
    <footer className="bg-marine-950 text-marine-200">
      <div className="conteneur py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo variante="clair" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-marine-300">
              {site.description}
            </p>
            {reseaux.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-3 text-sm">
                {reseaux.map(([reseau, url]) => (
                  <a
                    key={reseau}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-marine-200 transition hover:border-azur-400/40 hover:text-white"
                  >
                    {reseau.charAt(0).toUpperCase() + reseau.slice(1)}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              Découvrir
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/#fonctionnement" className="hover:text-white">Fonctionnement</Link></li>
              <li><Link href="/#avantages" className="hover:text-white">Avantages</Link></li>
              <li><Link href="/#formules" className="hover:text-white">Formules</Link></li>
              <li><Link href="/#faq" className="hover:text-white">Questions fréquentes</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              Espace artiste
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><Link href="/inscription" className="hover:text-white">Créer un compte</Link></li>
              <li><Link href="/connexion" className="hover:text-white">Se connecter</Link></li>
              <li><Link href="/conditions-utilisation" className="hover:text-white">Conditions d’utilisation</Link></li>
              <li><Link href="/politique-confidentialite" className="hover:text-white">Politique de confidentialité</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              Contact
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <Mail aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-azur-400" />
                <a href={`mailto:${contact.email}`} className="break-all hover:text-white">
                  {contact.email}
                </a>
              </li>
              {contact.whatsapp && (
                <li className="flex items-start gap-2.5">
                  <MessageCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-azur-400" />
                  <a
                    href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white"
                  >
                    WhatsApp : {contact.whatsapp}
                  </a>
                </li>
              )}
              {contact.telephone && (
                <li className="flex items-start gap-2.5">
                  <MessageCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-azur-400" />
                  <a href={`tel:${contact.telephone.replace(/\s/g, '')}`} className="hover:text-white">
                    {contact.telephone}
                  </a>
                </li>
              )}
              <li className="flex items-start gap-2.5">
                <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-azur-400" />
                <span>{contact.adresse}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-azur-400" />
                <span>{contact.horaires}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-marine-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {annee} {site.legal.raisonSociale}. Tous droits réservés.
          </p>
          <p>
            {site.contact.adresse} · Plateforme éditée en {site.legal.pays}
          </p>
        </div>
      </div>
    </footer>
  );
}
