import { ChevronDown, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { site } from '@/config/site';

const questions = [
  {
    question: 'Dois-je avoir un morceau prêt pour créer mon compte ?',
    reponse:
      'Non, et c’est un principe de la plateforme. L’inscription sert uniquement à créer votre compte et à choisir une formule. Vous reviendrez plus tard, depuis votre espace, pour soumettre votre première sortie lorsque votre musique sera prête.',
  },
  {
    question: 'Quelles informations sont demandées à l’inscription ?',
    reponse:
      'Votre nom complet, votre nom d’artiste, votre adresse e-mail, votre numéro de téléphone ou WhatsApp, votre pays, un mot de passe et votre type de compte (artiste indépendant ou représentant). Aucun détail musical n’est demandé.',
  },
  {
    question: 'Comment se passe le paiement ?',
    reponse:
      'Le paiement en ligne n’est pas encore activé. Vous pouvez déclarer un paiement manuel (Mobile Money, virement ou espèces) depuis votre espace. Un membre de notre équipe vérifie la réception effective du montant avant d’activer votre abonnement.',
  },
  {
    question: 'Mon abonnement est-il activé automatiquement après le paiement ?',
    reponse:
      'Non. Aucun abonnement n’est activé sans confirmation fiable. Après votre déclaration, le statut reste « en attente de paiement » jusqu’à la vérification par notre équipe.',
  },
  {
    question: 'Que se passe-t-il si j’ai oublié mon mot de passe ?',
    reponse:
      'Sur la page de connexion, cliquez sur « Mot de passe oublié » et suivez le lien reçu par e-mail. Pensez à vérifier vos courriers indésirables.',
  },
  {
    question: 'Puis-je soumettre plusieurs sorties avec le même compte ?',
    reponse:
      'Oui. Chaque projet de sortie (single, EP ou album) correspond à une demande distincte, avec ses propres fichiers et son propre statut. Votre compte peut en accueillir plusieurs au fil du temps.',
  },
  {
    question: 'Qui peut voir mes fichiers audio ?',
    reponse:
      'Vos pochettes et fichiers audio sont stockés dans un espace privé. Seuls votre compte et les administrateurs de la plateforme peuvent y accéder, via des liens temporaires.',
  },
  {
    question: 'En combien de temps ma musique sera-t-elle en ligne ?',
    reponse:
      'Cela dépend de la plateforme et de la conformité de votre dossier. Nous vous communiquons un calendrier réaliste après validation de votre demande, sans promesse de date garantie.',
  },
];

export function SectionFaq() {
  return (
    <section id="faq" className="scroll-mt-24 bg-white py-16 sm:py-20 lg:py-24">
      <div className="conteneur grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <span className="surtitre">Questions fréquentes</span>
          <h2 className="titre-section mt-3">Tout ce qu’il faut savoir avant de commencer</h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-marine-600">
            Vous ne trouvez pas votre réponse ? Écrivez-nous, nous répondons {site.delaiReponse}.
          </p>
          <a
            href={`mailto:${site.contact.email}`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-marine-200 bg-white px-4 py-3 text-sm font-semibold text-marine-800 shadow-sm transition hover:border-marine-300 hover:bg-marine-50"
          >
            <MessageCircle aria-hidden="true" className="h-4 w-4 text-azur-600" />
            {site.contact.email}
          </a>
        </div>

        <div className="divide-y divide-marine-100 rounded-3xl border border-marine-900/[0.06] bg-[#f8fafd] px-5 sm:px-7">
          {questions.map((element) => (
            <details key={element.question} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-semibold text-marine-900 [&::-webkit-details-marker]:hidden">
                {element.question}
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-marine-400 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 pr-8 text-sm leading-relaxed text-marine-600">{element.reponse}</p>
            </details>
          ))}
        </div>

        <p className="text-xs text-marine-500 lg:col-span-2">
          Consultez aussi nos{' '}
          <Link href="/conditions-utilisation" className="lien-texte">
            conditions d’utilisation
          </Link>{' '}
          et notre{' '}
          <Link href="/politique-confidentialite" className="lien-texte">
            politique de confidentialité
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
