'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { enregistrerFormule } from '@/actions/admin';
import { Alerte } from '@/components/ui/alerte';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Champ, Input, Select, Textarea } from '@/components/ui/champs';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { etatInitial } from '@/lib/validation';
import type { FormuleBD } from '@/types/database';

export function FormulaireFormule({ formule }: { formule?: FormuleBD }) {
  const [etat, action] = useActionState(enregistrerFormule, etatInitial);
  const erreurs = etat.erreursChamps ?? {};
  const modification = Boolean(formule);

  return (
    <form action={action} className="space-y-5" noValidate>
      {formule && <input type="hidden" name="id" value={formule.id} />}
      {formule && <input type="hidden" name="code" value={formule.code} />}
      <MessageFormulaire etat={etat} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Champ
          id="code"
          label="Code technique"
          requis
          erreur={erreurs.code}
          aide={
            modification
              ? 'Le code ne peut plus être modifié.'
              : 'Lettres minuscules, chiffres, - ou _. Ex. : artiste'
          }
        >
          <Input
            id="code"
            name={modification ? undefined : 'code'}
            defaultValue={formule?.code ?? ''}
            disabled={modification}
            required={!modification}
            pattern="[a-z0-9_-]{2,40}"
            erreur={Boolean(erreurs.code)}
          />
        </Champ>

        <Champ id="nom" label="Nom affiché" requis erreur={erreurs.nom}>
          <Input
            id="nom"
            name="nom"
            defaultValue={formule?.nom ?? ''}
            required
            maxLength={60}
            erreur={Boolean(erreurs.nom)}
          />
        </Champ>
      </div>

      <Champ id="description" label="Description" erreur={erreurs.description}>
        <Input
          id="description"
          name="description"
          defaultValue={formule?.description ?? ''}
          maxLength={300}
          erreur={Boolean(erreurs.description)}
        />
      </Champ>

      <div className="grid gap-5 sm:grid-cols-3">
        <Champ id="prix_fcfa" label="Prix (FCFA)" requis erreur={erreurs.prix_fcfa}>
          <Input
            id="prix_fcfa"
            name="prix_fcfa"
            type="number"
            min={0}
            step={1}
            defaultValue={formule?.prix_fcfa ?? 5000}
            required
            erreur={Boolean(erreurs.prix_fcfa)}
          />
        </Champ>

        <Champ id="duree_jours" label="Durée (jours)" requis erreur={erreurs.duree_jours}>
          <Input
            id="duree_jours"
            name="duree_jours"
            type="number"
            min={1}
            step={1}
            defaultValue={formule?.duree_jours ?? 30}
            required
            erreur={Boolean(erreurs.duree_jours)}
          />
        </Champ>

        <Champ id="ordre" label="Ordre d’affichage" erreur={erreurs.ordre}>
          <Input
            id="ordre"
            name="ordre"
            type="number"
            min={0}
            step={1}
            defaultValue={formule?.ordre ?? 0}
            erreur={Boolean(erreurs.ordre)}
          />
        </Champ>
      </div>

      <Champ
        id="avantages"
        label="Avantages"
        aide="Un avantage par ligne. Évitez les promesses non vérifiées."
        erreur={erreurs.avantages}
      >
        <Textarea
          id="avantages"
          name="avantages"
          rows={6}
          defaultValue={(formule?.avantages ?? []).join('\n')}
          maxLength={2000}
          erreur={Boolean(erreurs.avantages)}
        />
      </Champ>

      <div className="grid gap-5 sm:grid-cols-3">
        <Champ id="badge" label="Badge" erreur={erreurs.badge} aide="Ex. Recommandée">
          <Input
            id="badge"
            name="badge"
            defaultValue={formule?.badge ?? ''}
            maxLength={40}
            erreur={Boolean(erreurs.badge)}
          />
        </Champ>

        <Champ id="mis_en_avant" label="Mise en avant" erreur={erreurs.mis_en_avant}>
          <Select id="mis_en_avant" name="mis_en_avant" defaultValue={formule?.mis_en_avant ? 'oui' : 'non'}>
            <option value="non">Non</option>
            <option value="oui">Oui (carte sombre)</option>
          </Select>
        </Champ>

        <Champ id="actif" label="Statut" erreur={erreurs.actif}>
          <Select id="actif" name="actif" defaultValue={formule?.actif === false ? 'non' : 'oui'}>
            <option value="oui">Active (visible)</option>
            <option value="non">Inactive (masquée)</option>
          </Select>
        </Champ>
      </div>

      <Alerte type="info">
        Les modifications s’appliquent immédiatement au site public et à l’espace artiste. Les
        abonnements déjà souscrits conservent le tarif enregistré au moment de leur création.
      </Alerte>

      <div className="flex flex-wrap gap-3">
        <BoutonSoumettre taille="lg" enCours="Enregistrement…">
          {modification ? 'Enregistrer les modifications' : 'Créer la formule'}
        </BoutonSoumettre>
        <Link
          href="/admin/formules"
          className="inline-flex items-center rounded-xl px-4 py-3 text-sm font-semibold text-marine-600 hover:bg-marine-50"
        >
          Annuler
        </Link>
      </div>
    </form>
  );
}
