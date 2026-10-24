import type { Metadata } from 'next';
import Link from 'next/link';
import { PageLegale } from '@/components/marketing/page-legale';
import { site } from '@/config/site';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
  description: 'Conditions d’utilisation de la plateforme ARTIST DISTRIBUTION.',
};

export default function PageConditions() {
  return (
    <PageLegale
      titre="Conditions d’utilisation"
      introduction={`Les présentes conditions encadrent l’utilisation de la plateforme ${site.nom}, service de distribution musicale numérique.`}
    >
      <h2>1. Objet du service</h2>
      <p>
        {site.legal.raisonSociale} propose une plateforme permettant aux artistes et à leurs
        représentants de créer un compte, de souscrire à une formule d’abonnement et de préparer des
        demandes de distribution musicale. Le service accompagne la préparation des dossiers et leur
        transmission aux plateformes de diffusion partenaires.
      </p>
      <p>
        Le service ne garantit pas la mise en ligne par une plateforme tierce : chaque plateforme
        applique ses propres règles et se réserve le droit d’accepter ou de refuser un contenu.
      </p>

      <h2>2. Inscription et compte</h2>
      <p>
        L’inscription est ouverte à toute personne majeure ou représentée légalement, agissant en
        son nom ou comme représentant mandaté d’un artiste. Les informations fournies doivent être
        exactes et tenues à jour.
      </p>
      <p>
        La création du compte n’exige aucun fichier musical. La soumission d’une sortie est une
        étape distincte, réalisée depuis l’espace personnel lorsque l’artiste le décide.
      </p>
      <p>
        Les identifiants sont personnels et confidentiels. L’utilisateur s’engage à ne pas partager
        son mot de passe et à signaler sans délai toute utilisation suspecte.
      </p>

      <h2>3. Formules et abonnements</h2>
      <p>
        Les formules, leurs prix et leurs durées sont présentés sur la page « Formules » et dans
        l’espace artiste. Les tarifs affichés sont susceptibles d’évoluer ; le montant applicable est
        celui confirmé au moment de la souscription.
      </p>
      <p>
        Un abonnement n’est activé qu’après vérification du paiement par notre équipe ou confirmation
        fiable du prestataire de paiement. Aucun abonnement n’est activé automatiquement sur la seule
        déclaration de l’utilisateur.
      </p>

      <h2>4. Paiements</h2>
      <p>
        Selon la configuration du service, le paiement peut être effectué en ligne ou par un moyen
        local (Mobile Money, virement, espèces) avec vérification manuelle. Le paiement en ligne
        n’est proposé que lorsqu’un prestataire adapté est effectivement configuré.
      </p>
      <p>
        L’utilisateur doit fournir une référence de paiement exacte. Une déclaration inexacte ou
        frauduleuse peut entraîner la suspension du compte.
      </p>

      <h2>5. Demandes de distribution</h2>
      <p>
        L’artiste garantit détenir les droits nécessaires sur les œuvres, les enregistrements, les
        pochettes et les crédits qu’il transmet. Il s’engage à ne pas soumettre de contenu
        contrefaisant, haineux, illégal ou portant atteinte aux droits de tiers.
      </p>
      <p>
        Les demandes peuvent faire l’objet de demandes de correction, d’une validation, d’un envoi
        aux plateformes ou d’un refus motivé. Les étapes sont visibles depuis l’espace artiste.
      </p>

      <h2>6. Contenus et propriété intellectuelle</h2>
      <p>
        L’artiste conserve la propriété de ses œuvres. Il autorise {site.legal.raisonSociale} à
        utiliser les éléments transmis uniquement pour l’exécution du service : vérification,
        préparation, transmission aux plateformes et communication liée à la sortie.
      </p>
      <p>
        La marque, l’interface et les éléments graphiques de la plateforme restent la propriété de
        leur titulaire. Toute reproduction non autorisée est interdite.
      </p>

      <h2>7. Disponibilité et responsabilité</h2>
      <p>
        Nous mettons en œuvre des moyens raisonnables pour assurer la disponibilité du service. Des
        interruptions peuvent survenir pour maintenance, mise à jour ou en raison d’un prestataire
        externe.
      </p>
      <p>
        Nous ne pouvons être tenus responsables des décisions des plateformes de diffusion, des
        délais de traitement qui leur sont propres, ni des contenus fournis par les utilisateurs.
      </p>

      <h2>8. Suspension et résiliation</h2>
      <p>
        Tout manquement aux présentes conditions, toute fraude au paiement ou toute atteinte aux
        droits de tiers peut entraîner la suspension ou la fermeture du compte, après information de
        l’utilisateur lorsque cela est possible.
      </p>

      <h2>9. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans notre{' '}
        <Link href="/politique-confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>10. Droit applicable et contact</h2>
      <p>
        Les présentes conditions sont soumises au droit applicable au {site.legal.pays}. Pour toute
        question, écrivez à{' '}
        <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>.
      </p>
      <p>
        Identifiant légal de l’éditeur :{' '}
        {site.legal.numeroIdentifiant || 'à compléter avant le lancement public'}.
      </p>
    </PageLegale>
  );
}
