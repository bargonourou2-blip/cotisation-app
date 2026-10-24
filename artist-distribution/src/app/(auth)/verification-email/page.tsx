import type { Metadata } from 'next';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { EnteteAuth } from '@/components/auth/entete-auth';
import { FormulaireRenvoyerConfirmation } from '@/components/auth/formulaire-renvoyer-confirmation';
import { Alerte } from '@/components/ui/alerte';

export const metadata: Metadata = {
  title: 'Vérifiez votre e-mail',
};

export default async function PageVerificationEmail({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = typeof params.email === 'string' ? params.email.slice(0, 200) : '';

  return (
    <>
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-azur-50 text-azur-600 ring-1 ring-inset ring-azur-600/10">
        <MailCheck aria-hidden="true" className="h-6 w-6" />
      </div>

      <EnteteAuth
        titre="Vérifiez votre boîte de réception"
        sousTitre={
          email ? (
            <>
              Nous avons envoyé un lien de confirmation à <strong className="text-marine-900">{email}</strong>.
            </>
          ) : (
            'Nous avons envoyé un lien de confirmation à votre adresse e-mail.'
          )
        }
      />

      <div className="space-y-5">
        <Alerte type="info" titre="Que faire maintenant ?">
          <ol className="mt-1 list-decimal space-y-1.5 pl-4">
            <li>Ouvrez l’e-mail de {`« ARTIST DISTRIBUTION »`}.</li>
            <li>Cliquez sur le lien de confirmation pour activer votre compte.</li>
            <li>Vous serez ensuite redirigé vers votre espace artiste.</li>
          </ol>
        </Alerte>

        <p className="text-sm leading-relaxed text-marine-600">
          Vous ne trouvez pas l’e-mail ? Vérifiez vos courriers indésirables, puis utilisez le
          bouton ci-dessous. Le lien reste valable une heure.
        </p>

        {email && <FormulaireRenvoyerConfirmation email={email} />}

        <div className="border-t border-marine-100 pt-5 text-sm text-marine-600">
          <p>
            Vous avez déjà confirmé votre adresse ?{' '}
            <Link href="/connexion" className="lien-texte">
              Se connecter
            </Link>
          </p>
          <p className="mt-2">
            Adresse incorrecte ?{' '}
            <Link href="/inscription" className="lien-texte">
              Recommencer l’inscription
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
