import { ArrowRight, CalendarClock, CreditCard, FolderCheck, UserPlus } from 'lucide-react';
import { LienBouton } from '@/components/ui/button';

const etapes = [
  {
    numero: '01',
    icone: UserPlus,
    titre: 'Créez votre compte',
    texte:
      'Quelques informations seulement : votre nom, votre nom d’artiste, un e-mail, un numéro joignable et votre pays.',
  },
  {
    numero: '02',
    icone: CreditCard,
    titre: 'Choisissez votre formule',
    texte:
      'Sélectionnez l’offre qui vous convient et réglez par Mobile Money ou autre moyen. Notre équipe vérifie le paiement.',
  },
  {
    numero: '03',
    icone: CalendarClock,
    titre: 'Préparez votre sortie',
    texte:
      'Revenez quand votre morceau est prêt. Renseignez les crédits, ajoutez la pochette et le fichier audio.',
  },
  {
    numero: '04',
    icone: FolderCheck,
    titre: 'Suivez jusqu’à la publication',
    texte:
      'Votre tableau de bord affiche chaque étape. Vous êtes informé en cas de correction nécessaire.',
  },
];

export function SectionFonctionnement() {
  return (
    <section id="fonctionnement" className="scroll-mt-24 bg-white py-16 sm:py-20 lg:py-24">
      <div className="conteneur">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <span className="surtitre">Comment ça marche</span>
            <h2 className="titre-section mt-3">Quatre étapes, sans pression</h2>
          </div>
          <p className="max-w-xl text-base leading-relaxed text-marine-600 lg:justify-self-end">
            L’inscription et la demande de distribution sont{' '}
            <strong className="font-semibold text-marine-900">deux étapes totalement séparées</strong>.
            Vous pouvez rejoindre la plateforme aujourd’hui, même si votre premier morceau n’existe
            pas encore.
          </p>
        </div>

        <ol className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {etapes.map(({ numero, icone: Icone, titre, texte }, index) => (
            <li key={numero} className="relative">
              <div className="h-full rounded-3xl border border-marine-900/[0.06] bg-[#f8fafd] p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-azur-700 shadow-sm ring-1 ring-marine-900/5">
                    <Icone aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="font-display text-3xl font-extrabold text-marine-200">
                    {numero}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-base font-bold text-marine-950">{titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-marine-600">{texte}</p>
              </div>
              {index < etapes.length - 1 && (
                <ArrowRight
                  aria-hidden="true"
                  className="absolute -right-3.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-marine-300 lg:block"
                />
              )}
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-4 rounded-3xl border border-azur-200/60 bg-gradient-to-br from-azur-50 via-white to-sable-50 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-marine-950 text-white sm:flex">
              <FolderCheck aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-marine-950">
                Compte créé ≠ musique envoyée
              </h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-marine-700">
                À l’inscription, nous ne demandons <strong>ni titre, ni fichier audio, ni pochette,
                ni crédits musicaux</strong>. Le formulaire de distribution s’ouvre uniquement
                lorsque vous décidez de préparer une sortie.
              </p>
            </div>
          </div>
          <LienBouton href="/inscription" variante="principal" taille="md" className="justify-self-start lg:justify-self-end">
            Créer mon compte
          </LienBouton>
        </div>
      </div>
    </section>
  );
}
