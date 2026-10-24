'use server';

import { revalidatePath } from 'next/cache';
import { creerClientServeur } from '@/lib/supabase/server';
import { exigerUtilisateur } from '@/lib/auth';
import { erreursParChamp, etatInitial, schemaProfil, texte, type EtatFormulaire } from '@/lib/validation';

/** Mise à jour du profil de l'artiste. */
export async function mettreAJourProfil(
  _etat: EtatFormulaire = etatInitial,
  formData: FormData,
): Promise<EtatFormulaire> {
  const utilisateur = await exigerUtilisateur('/espace/profil');

  const verif = schemaProfil.safeParse({
    nom_complet: texte(formData, 'nom_complet'),
    nom_artiste: texte(formData, 'nom_artiste'),
    telephone: texte(formData, 'telephone'),
    pays: texte(formData, 'pays'),
    type_compte: texte(formData, 'type_compte'),
  });

  if (!verif.success) {
    return {
      statut: 'erreur',
      message: 'Merci de vérifier les champs signalés.',
      erreursChamps: erreursParChamp(verif.error),
    };
  }

  const supabase = await creerClientServeur();
  // Seules les colonnes autorisées par les droits SQL peuvent être modifiées :
  // le rôle et l'e-mail ne sont pas modifiables ici.
  const { error } = await supabase
    .from('profiles')
    .update({
      nom_complet: verif.data.nom_complet,
      nom_artiste: verif.data.nom_artiste,
      telephone: verif.data.telephone,
      pays: verif.data.pays,
      type_compte: verif.data.type_compte,
    })
    .eq('id', utilisateur.id);

  if (error) {
    console.error('Mise à jour du profil :', error.message);
    return {
      statut: 'erreur',
      message: 'La mise à jour a échoué. Réessayez dans un instant.',
    };
  }

  revalidatePath('/espace');
  revalidatePath('/espace/profil');
  return { statut: 'succes', message: 'Vos informations ont été mises à jour.' };
}
