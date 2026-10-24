'use client';

import { useActionState } from 'react';
import { mettreAJourProfil } from '@/actions/compte';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Champ, Input, Select } from '@/components/ui/champs';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { etatInitial } from '@/lib/validation';
import { PAYS } from '@/lib/pays';
import type { Profil } from '@/types/database';

export function FormulaireProfil({ profil }: { profil: Profil }) {
  const [etat, action] = useActionState(mettreAJourProfil, etatInitial);
  const erreurs = etat.erreursChamps ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      <MessageFormulaire etat={etat} />

      <Champ id="nom_complet" label="Nom complet" requis erreur={erreurs.nom_complet}>
        <Input
          id="nom_complet"
          name="nom_complet"
          defaultValue={profil.nom_complet}
          autoComplete="name"
          required
          erreur={Boolean(erreurs.nom_complet)}
        />
      </Champ>

      <Champ id="nom_artiste" label="Nom d’artiste ou nom professionnel" requis erreur={erreurs.nom_artiste}>
        <Input
          id="nom_artiste"
          name="nom_artiste"
          defaultValue={profil.nom_artiste}
          required
          erreur={Boolean(erreurs.nom_artiste)}
        />
      </Champ>

      <div className="grid gap-5 sm:grid-cols-2">
        <Champ id="telephone" label="Téléphone / WhatsApp" requis erreur={erreurs.telephone}>
          <Input
            id="telephone"
            name="telephone"
            type="tel"
            inputMode="tel"
            defaultValue={profil.telephone}
            autoComplete="tel"
            required
            erreur={Boolean(erreurs.telephone)}
          />
        </Champ>

        <Champ id="pays" label="Pays" requis erreur={erreurs.pays}>
          <Select id="pays" name="pays" defaultValue={profil.pays} required erreur={Boolean(erreurs.pays)}>
            {!PAYS.includes(profil.pays) && <option value={profil.pays}>{profil.pays}</option>}
            {PAYS.map((pays) => (
              <option key={pays} value={pays}>
                {pays}
              </option>
            ))}
          </Select>
        </Champ>
      </div>

      <Champ id="type_compte" label="Type de compte" requis erreur={erreurs.type_compte}>
        <Select
          id="type_compte"
          name="type_compte"
          defaultValue={profil.type_compte}
          erreur={Boolean(erreurs.type_compte)}
        >
          <option value="artiste_independant">Artiste indépendant</option>
          <option value="representant">Représentant d’artiste</option>
        </Select>
      </Champ>

      <BoutonSoumettre taille="lg" enCours="Enregistrement…">
        Enregistrer les modifications
      </BoutonSoumettre>
    </form>
  );
}
