import {
  Clock3,
  FileCheck2,
  Headphones,
  LockKeyhole,
  Smartphone,
  Sparkles,
  UserRoundCheck,
  Users,
} from 'lucide-react';

const avantages = [
  {
    icone: Sparkles,
    titre: 'Inscrivez-vous sans morceau prêt',
    texte:
      'Créez votre compte et choisissez votre formule dès maintenant. Vous ajouterez votre musique plus tard, quand elle sera prête.',
  },
  {
    icone: FileCheck2,
    titre: 'Un suivi transparent',
    texte:
      'Chaque demande possède un statut clair : vous savez toujours où en est votre sortie et ce qu’il vous reste à faire.',
  },
  {
    icone: Smartphone,
    titre: 'Pensé pour le téléphone',
    texte:
      'Une interface rapide, lisible et confortable sur les petits écrans Android, même avec une connexion limitée.',
  },
  {
    icone: UserRoundCheck,
    titre: 'Un accompagnement humain',
    texte:
      'Notre équipe vérifie les informations et vous guide sur les crédits, les délais et les étapes de la distribution.',
  },
  {
    icone: LockKeyhole,
    titre: 'Vos fichiers restent privés',
    texte:
      'Vos pochettes et fichiers audio sont stockés dans un espace privé. Seuls vous et notre équipe y avez accès.',
  },
  {
    icone: Clock3,
    titre: 'Plusieurs sorties dans le temps',
    texte:
      'Un même compte peut accueillir plusieurs singles, EP ou albums, chacun avec son propre suivi.',
  },
  {
    icone: Headphones,
    titre: 'Paiement adapté au contexte local',
    texte:
      'Mobile Money, virement ou espèces : le paiement manuel est vérifié par notre équipe avant l’activation de l’abonnement.',
  },
  {
    icone: Users,
    titre: 'Artiste ou représentant',
    texte:
      'Créez un compte en votre nom ou en tant que représentant mandaté par un artiste.',
  },
];

export function SectionAvantages() {
  return (
    <section id="avantages" className="scroll-mt-24 py-16 sm:py-20 lg:py-24">
      <div className="conteneur">
        <div className="mx-auto max-w-2xl text-center">
          <span className="surtitre">Pourquoi nous choisir</span>
          <h2 className="titre-section mt-3">
            Une plateforme conçue pour les réalités des artistes africains
          </h2>
          <p className="mt-4 text-base leading-relaxed text-marine-600">
            Pas de jargon inutile, pas de démarches compliquées : un espace simple pour préparer,
            envoyer et suivre vos sorties musicales.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {avantages.map(({ icone: Icone, titre, texte }, index) => (
            <article
              key={titre}
              className="group relative overflow-hidden rounded-3xl border border-marine-900/[0.06] bg-white p-6 shadow-carte transition duration-300 hover:-translate-y-0.5 hover:shadow-carte-survol"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-azur-50 text-azur-700 ring-1 ring-inset ring-azur-600/10 transition group-hover:bg-azur-600 group-hover:text-white">
                <Icone aria-hidden="true" className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-display text-base font-bold text-marine-950">{titre}</h3>
              <p className="mt-2 text-sm leading-relaxed text-marine-600">{texte}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
