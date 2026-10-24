'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { creerClientServeur } from '@/lib/supabase/server';
import { exigerUtilisateur } from '@/lib/auth';
import {
  erreursParChamp,
  etatInitial,
  schemaPaiementManuel,
  texte,
  type EtatFormulaire,
} from '@/lib/validation';

function messageErreurAbonnement(brut: string): string {
  const texteErreur = brut.toLowerCase();
  if (texteErreur.includes('déjà un abonnement actif')) {
    return 'Vous avez déjà un abonnement actif. Contactez-nous si vous souhaitez changer de formule.';
  }
  if (texteErreur.includes('pas disponible')) {
    return 'Cette formule n’est plus disponible. Rechargez la page pour voir les formules à jour.';
  }
  if (texteErreur.includes('en cours de vérification')) {
    return 'Un paiement est déjà en cours de vérification pour cet abonnement.';
  }
  if (texteErreur.includes('attend plus de paiement')) {
    return 'Cet abonnement n’attend plus de paiement. Consultez votre espace pour voir son statut.';
  }
  if (texteErreur.includes('référence')) {
    return 'La référence du paiement est obligatoire.';
  }
  return 'L’opération n’a pas pu être effectuée. Réessayez dans un instant.';
}

/** Souscription à une formule. L'abonnement reste en attente de paiement. */
export async function souscrireFormule(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur('/espace/abonnement');

  const code = texte(formData, 'plan_code');
  if (!/^[a-z0-9_-]{2,40}$/.test(code)) {
    return { statut: 'erreur', message: 'Choisissez une formule valide.' };
  }

  const supabase = await creerClientServeur();
  // Le prix est relu en base : aucune valeur envoyée par le navigateur n'est utilisée.
  const { error } = await supabase.rpc('creer_abonnement', { p_plan_code: code });

  if (error) {
    console.error('Souscription :', error.message);
    return { statut: 'erreur', message: messageErreurAbonnement(error.message) };
  }

  revalidatePath('/espace');
  revalidatePath('/espace/abonnement');
  redirect('/espace/abonnement/paiement?nouveau=1');
}

/**
 * Déclaration d'un paiement manuel.
 * ⚠️ Cela n'active JAMAIS l'abonnement : un administrateur doit confirmer
 *    la réception réelle du paiement.
 */
export async function declarerPaiement(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  await exigerUtilisateur('/espace/abonnement/paiement');

  const abonnementId = texte(formData, 'abonnement_id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(abonnementId)) {
    return { statut: 'erreur', message: 'Abonnement introuvable. Rechargez la page.' };
  }

  const verif = schemaPaiementManuel.safeParse({
    moyen: texte(formData, 'moyen'),
    reference: texte(formData, 'reference'),
    telephone_payeur: texte(formData, 'telephone_payeur'),
    note_client: texte(formData, 'note_client'),
  });

  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Merci de vérifier les champs signalés.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.rpc('declarer_paiement_manuel', {
    p_subscription_id: abonnementId,
    p_moyen: verif.data.moyen,
    p_reference: verif.data.reference,
    p_telephone: verif.data.telephone_payeur || null,
    p_note: verif.data.note_client || null,
  });

  if (error) {
    console.error('Déclaration de paiement :', error.message);
    return { statut: 'erreur', message: messageErreurAbonnement(error.message) };
  }

  revalidatePath('/espace');
  revalidatePath('/espace/abonnement');
  redirect('/espace/abonnement?paiement=declare');
}
