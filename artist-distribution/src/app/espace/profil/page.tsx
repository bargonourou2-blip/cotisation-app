import type { Metadata } from 'next';
import Link from 'next/link';
import { KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { FormulaireProfil } from '@/components/espace/formulaire-profil';
import { Bouton } from '@/components/ui/button';
import { deconnexion } from '@/actions/auth';
import { exigerProfil } from '@/lib/auth';
import { dateLongue } from '@/lib/format';
import { TYPES_COMPTE } from '@/lib/statuts';

export const metadata: Metadata = { title: 'Mon profil' };

export default async function PageProfil() {
  const profil = await exigerProfil('/espace/profil');

  return (
    <>
      <EntetePage
        titre="Mon profil"
        sousTitre="Ces informations servent à vous identifier et à vous contacter au sujet de vos sorties."
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <h2 className="font-display text-lg font-bold text-marine-950">Informations personnelles</h2>
          <p className="mt-1 text-sm text-marine-600">
            Votre adresse e-mail ne peut pas être modifiée ici. Contactez notre équipe si nécessaire.
          </p>
          <div className="mt-5">
            <FormulaireProfil profil={profil} />
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-azur-50 text-azur-700">
                <Mail aria-hidden="true" className="h-4 w-4" />
              </span>
              <h2 className="font-display text-base font-bold text-marine-950">Compte</h2>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-marine-400">Adresse e-mail</dt>
                <dd className="break-all font-medium text-marine-900">{profil.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-marine-400">Type de compte</dt>
                <dd className="font-medium text-marine-900">{TYPES_COMPTE[profil.type_compte]}</dd>
              </div>
              <div>
                <dt className="text-xs text-marine-400">Inscription</dt>
                <dd className="font-medium text-marine-900">{dateLongue(profil.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-marine-400">Conditions acceptées le</dt>
                <dd className="font-medium text-marine-900">
                  {dateLongue(profil.conditions_acceptees_le)}
                </dd>
              </div>
            </dl>

            <div className="mt-5 space-y-2">
              <Link
                href="/nouveau-mot-de-passe"
                className="flex items-center justify-between rounded-xl border border-marine-200 px-3.5 py-2.5 text-sm font-medium text-marine-700 transition hover:bg-marine-50"
              >
                <span className="flex items-center gap-2">
                  <KeyRound aria-hidden="true" className="h-4 w-4 text-marine-400" />
                  Changer mon mot de passe
                </span>
                <span aria-hidden="true" className="text-marine-300">
                  →
                </span>
              </Link>
              <Link
                href="/politique-confidentialite"
                className="flex items-center justify-between rounded-xl border border-marine-200 px-3.5 py-2.5 text-sm font-medium text-marine-700 transition hover:bg-marine-50"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="h-4 w-4 text-marine-400" />
                  Politique de confidentialité
                </span>
                <span aria-hidden="true" className="text-marine-300">
                  →
                </span>
              </Link>
            </div>
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Session</h2>
            <p className="mt-1 text-sm text-marine-600">
              Déconnectez-vous si vous utilisez un appareil partagé.
            </p>
            <form action={deconnexion} className="mt-4">
              <Bouton type="submit" variante="secondaire" taille="md" className="w-full">
                <LogOut aria-hidden="true" className="h-4 w-4" />
                Se déconnecter
              </Bouton>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
