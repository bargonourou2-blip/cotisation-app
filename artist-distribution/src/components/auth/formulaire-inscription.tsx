'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { inscription } from '@/actions/auth';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { CaseACocher, Champ, Input, Select } from '@/components/ui/champs';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { PAYS } from '@/lib/pays';
import { etatInitial } from '@/lib/validation';

const typesCompte = [
  {
    value: 'artiste_independant',
    label: 'Artiste indépendant',
    description: 'Je crée ce compte pour moi-même.',
  },
  {
    value: 'representant',
    label: 'Représentant d’artiste',
    description: 'Je gère les sorties d’un ou plusieurs artistes.',
  },
];

export function FormulaireInscription({ formule }: { formule?: string }) {
  const [etat, action] = useActionState(inscription, etatInitial);
  const erreurs = etat.erreursChamps ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {formule && <input type="hidden" name="formule" value={formule} />}

      <MessageFormulaire etat={etat} />

      <div className="flex gap-2.5 rounded-2xl border border-azur-200/70 bg-azur-50/60 px-4 py-3 text-xs leading-relaxed text-azur-900">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          À cette étape, nous ne demandons <strong>aucune information sur votre musique</strong>.
          Vous pourrez soumettre vos titres plus tard, depuis votre espace.
        </p>
      </div>

      <Champ id="nom_complet" label="Nom complet" requis erreur={erreurs.nom_complet}>
        <Input
          id="nom_complet"
          name="nom_complet"
          autoComplete="name"
          placeholder="Ezéchiel Bargo"
          required
          erreur={Boolean(erreurs.nom_complet)}
        />
      </Champ>

      <Champ
        id="nom_artiste"
        label="Nom d’artiste ou nom professionnel"
        requis
        erreur={erreurs.nom_artiste}
        aide="C’est le nom qui apparaîtra dans votre espace."
      >
        <Input
          id="nom_artiste"
          name="nom_artiste"
          autoComplete="nickname"
          placeholder="Ex. Eza"
          required
          erreur={Boolean(erreurs.nom_artiste)}
        />
      </Champ>

      <Champ id="email" label="Adresse e-mail" requis erreur={erreurs.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="vous@exemple.com"
          required
          erreur={Boolean(erreurs.email)}
        />
      </Champ>

      <div className="grid gap-5 sm:grid-cols-2">
        <Champ
          id="telephone"
          label="Téléphone / WhatsApp"
          requis
          erreur={erreurs.telephone}
          aide="Avec l’indicatif pays."
        >
          <Input
            id="telephone"
            name="telephone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+226 70 00 00 00"
            required
            erreur={Boolean(erreurs.telephone)}
          />
        </Champ>

        <Champ id="pays" label="Pays" requis erreur={erreurs.pays}>
          <Select id="pays" name="pays" defaultValue="Burkina Faso" required erreur={Boolean(erreurs.pays)}>
            {PAYS.map((pays) => (
              <option key={pays} value={pays}>
                {pays}
              </option>
            ))}
          </Select>
        </Champ>
      </div>

      <fieldset>
        <legend className="etiquette">Type de compte</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {typesCompte.map((type, index) => (
            <label
              key={type.value}
              className="relative flex cursor-pointer rounded-2xl border border-marine-200 bg-white p-3.5 transition hover:border-marine-300 has-[:checked]:border-azur-500 has-[:checked]:bg-azur-50/60 has-[:checked]:ring-1 has-[:checked]:ring-azur-500"
            >
              <input
                type="radio"
                name="type_compte"
                value={type.value}
                defaultChecked={index === 0}
                className="sr-only"
              />
              <span>
                <span className="block text-sm font-semibold text-marine-950">{type.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-marine-500">
                  {type.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        {erreurs.type_compte && <p className="erreur-champ">{erreurs.type_compte}</p>}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Champ
          id="mot_de_passe"
          label="Mot de passe"
          requis
          erreur={erreurs.mot_de_passe}
          aide="8 caractères minimum, avec une lettre et un chiffre."
        >
          <Input
            id="mot_de_passe"
            name="mot_de_passe"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            erreur={Boolean(erreurs.mot_de_passe)}
          />
        </Champ>

        <Champ id="confirmation" label="Confirmer le mot de passe" requis erreur={erreurs.confirmation}>
          <Input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            erreur={Boolean(erreurs.confirmation)}
          />
        </Champ>
      </div>

      <CaseACocher
        id="conditions"
        name="conditions"
        value="oui"
        required
        erreur={erreurs.conditions}
        label={
          <>
            J’accepte les{' '}
            <Link
              href="/conditions-utilisation"
              target="_blank"
              className="font-semibold text-azur-700 underline underline-offset-2"
            >
              conditions d’utilisation
            </Link>{' '}
            et la{' '}
            <Link
              href="/politique-confidentialite"
              target="_blank"
              className="font-semibold text-azur-700 underline underline-offset-2"
            >
              politique de confidentialité
            </Link>
            .
          </>
        }
      />

      <BoutonSoumettre taille="lg" className="w-full" enCours="Création du compte…">
        Créer mon compte
      </BoutonSoumettre>

      <p className="text-center text-sm text-marine-600">
        Vous avez déjà un compte ?{' '}
        <Link href="/connexion" className="lien-texte">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
