import type { Metadata } from 'next';
import Link from 'next/link';
import { PageLegale } from '@/components/marketing/page-legale';
import { site } from '@/config/site';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Comment ARTIST DISTRIBUTION collecte et protège vos données personnelles.',
};

export default function PageConfidentialite() {
  return (
    <PageLegale
      titre="Politique de confidentialité"
      introduction={`Cette politique explique quelles données ${site.nom} collecte, pourquoi et comment elles sont protégées.`}
    >
      <h2>1. Responsable du traitement</h2>
      <p>
        {site.legal.raisonSociale}, {site.contact.adresse}, est responsable du traitement des
        données décrites ci-dessous. Contact :{' '}
        <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>.
      </p>

      <h2>2. Données collectées</h2>
      <ul>
        <li>
          <strong>Compte :</strong> nom complet, nom d’artiste, adresse e-mail, numéro de téléphone
          ou WhatsApp, pays, type de compte, date d’acceptation des conditions.
        </li>
        <li>
          <strong>Authentification :</strong> mot de passe. Il est stocké sous forme chiffrée/hachée
          par notre prestataire d’authentification ; nous n’y avons jamais accès en clair.
        </li>
        <li>
          <strong>Abonnement et paiement :</strong> formule choisie, montant, statut, moyen de
          paiement, référence de transaction, notes transmises pour vérification.
        </li>
        <li>
          <strong>Demandes de distribution :</strong> informations musicales, crédits, pochette et
          fichier audio, ainsi que l’historique des statuts.
        </li>
        <li>
          <strong>Données techniques :</strong> journaux nécessaires au fonctionnement et à la
          sécurité du service.
        </li>
      </ul>
      <p>
        <strong>Aucune donnée musicale n’est demandée pendant la création du compte.</strong> Les
        informations musicales ne sont collectées que lorsque l’artiste décide de soumettre une
        sortie.
      </p>

      <h2>3. Données que nous ne collectons pas</h2>
      <p>
        Nous ne collectons pas de données bancaires complètes : les paiements sont réalisés auprès
        de l’opérateur ou du prestataire choisi. Nous ne demandons jamais votre code PIN Mobile
        Money. Nous n’utilisons pas de cookies publicitaires.
      </p>

      <h2>4. Finalités et bases légales</h2>
      <ul>
        <li>Créer et gérer votre compte (exécution du contrat).</li>
        <li>Gérer les abonnements et vérifier les paiements (exécution du contrat, obligations légales).</li>
        <li>Traiter vos demandes de distribution (exécution du contrat).</li>
        <li>Vous informer du statut de vos demandes et répondre à vos questions (intérêt légitime).</li>
        <li>Assurer la sécurité de la plateforme et prévenir les fraudes (intérêt légitime).</li>
      </ul>

      <h2>5. Destinataires et sous-traitants</h2>
      <p>
        Les données sont hébergées et traitées par des prestataires techniques, notamment :
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> : base de données, authentification et stockage privé des
          fichiers.
        </li>
        <li>
          <strong>Vercel</strong> : hébergement de l’application.
        </li>
        <li>
          <strong>Fournisseur d’e-mail</strong> (via Supabase) : envoi des messages de confirmation
          et de réinitialisation.
        </li>
        <li>
          <strong>Prestataire de paiement</strong>, s’il est configuré, et opérateurs Mobile Money.
        </li>
      </ul>
      <p>
        Certains prestataires peuvent héberger des données en dehors du Burkina Faso. Nous
        privilégions des prestataires présentant des garanties appropriées de sécurité.
      </p>

      <h2>6. Durée de conservation</h2>
      <p>
        Les données de compte sont conservées tant que le compte est actif, puis archivées ou
        supprimées selon les obligations légales. Les documents liés à un paiement peuvent être
        conservés plus longtemps pour répondre aux obligations comptables. Les fichiers audio et
        pochettes sont supprimés à la suppression d’une demande ou du compte, sauf obligation
        contraire.
      </p>

      <h2>7. Sécurité</h2>
      <p>
        Nous appliquons des mesures techniques et organisationnelles : chiffrement des échanges
        (HTTPS), isolation des données par utilisateur au niveau de la base (règles Row Level
        Security), stockage privé des fichiers avec liens temporaires, contrôle des accès
        d’administration côté serveur, journalisation des actions sensibles.
      </p>

      <h2>8. Vos droits</h2>
      <p>
        Vous pouvez demander l’accès à vos données, leur rectification, leur suppression ou la
        limitation de leur traitement, et vous opposer à certains traitements. Pour exercer ces
        droits, écrivez à{' '}
        <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>. Une réponse vous sera
        apportée dans les délais prévus par la législation applicable.
      </p>
      <p>
        Vous pouvez également saisir l’autorité compétente de protection des données personnelles de
        votre pays de résidence.
      </p>

      <h2>9. Cookies et session</h2>
      <p>
        La plateforme utilise uniquement des cookies techniques nécessaires à l’authentification et
        à la sécurité de la session. Aucun cookie publicitaire ou de pistage tiers n’est utilisé.
      </p>

      <h2>10. Modifications</h2>
      <p>
        Cette politique peut être mise à jour pour refléter une évolution du service ou de la
        réglementation. La date de dernière mise à jour figure en haut de cette page.
      </p>

      <p>
        Voir aussi nos{' '}
        <Link href="/conditions-utilisation">conditions d’utilisation</Link>.
      </p>
    </PageLegale>
  );
}
