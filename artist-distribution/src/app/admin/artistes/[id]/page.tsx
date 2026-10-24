import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { Badge } from '@/components/ui/badge';
import { creerClientServeur } from '@/lib/supabase/server';
import { dateCourte, dateHeure, fcfa } from '@/lib/format';
import {
  MOYENS_PAIEMENT,
  statutAbonnement,
  statutAbonnementEffectif,
  statutPaiement,
  statutSortie,
  TYPES_COMPTE,
} from '@/lib/statuts';

export const metadata: Metadata = { title: 'Fiche artiste' };

export default async function PageArtisteAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await creerClientServeur();

  const { data: profil } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!profil) notFound();

  const [{ data: abonnements }, { data: paiements }, { data: sorties }] = await Promise.all([
    supabase.from('subscriptions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('payments').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('releases').select('*').eq('user_id', id).order('updated_at', { ascending: false }),
  ]);

  return (
    <>
      <Link
        href="/admin/artistes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-marine-500 hover:text-marine-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Retour aux artistes
      </Link>

      <EntetePage
        titre={profil.nom_artiste}
        sousTitre={`${profil.nom_complet} · ${TYPES_COMPTE[profil.type_compte]}`}
        action={
          profil.role === 'admin' ? (
            <Badge ton="violet">
              <ShieldCheck aria-hidden="true" className="h-3 w-3" />
              Administrateur
            </Badge>
          ) : (
            <Badge ton="neutre">Compte artiste</Badge>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
          <h2 className="font-display text-base font-bold text-marine-950">Coordonnées</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <Mail aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
              <a href={`mailto:${profil.email}`} className="break-all font-medium text-marine-900 hover:underline">
                {profil.email}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Phone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
              <a
                href={`tel:${profil.telephone.replace(/\s/g, '')}`}
                className="font-medium text-marine-900 hover:underline"
              >
                {profil.telephone}
              </a>
            </li>
            {profil.telephone.replace(/[^0-9]/g, '').length >= 8 && (
              <li className="flex items-start gap-2.5">
                <MessageCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <a
                  href={`https://wa.me/${profil.telephone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-marine-900 hover:underline"
                >
                  Écrire sur WhatsApp
                </a>
              </li>
            )}
            <li className="flex items-start gap-2.5">
              <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-marine-400" />
              <span className="font-medium text-marine-900">{profil.pays}</span>
            </li>
          </ul>
          <dl className="mt-5 space-y-2 border-t border-marine-100 pt-4 text-xs text-marine-500">
            <div className="flex justify-between gap-3">
              <dt>Inscription</dt>
              <dd className="font-medium text-marine-800">{dateCourte(profil.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Conditions acceptées</dt>
              <dd className="font-medium text-marine-800">{dateCourte(profil.conditions_acceptees_le)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Identifiant</dt>
              <dd className="truncate font-mono text-[0.65rem] text-marine-600">{profil.id}</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-5">
          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Abonnements</h2>
            {(abonnements ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-marine-500">Aucun abonnement.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {(abonnements ?? []).map((element) => {
                  const definition = statutAbonnement(statutAbonnementEffectif(element) ?? element.statut);
                  return (
                    <li
                      key={element.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-marine-100 px-3.5 py-2.5 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-marine-900">
                          {element.plan_nom} · {fcfa(element.prix_fcfa)}
                        </p>
                        <p className="text-xs text-marine-500">
                          {dateCourte(element.debut)} → {dateCourte(element.fin)}
                        </p>
                      </div>
                      <Badge ton={definition.ton}>{definition.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <h2 className="font-display text-base font-bold text-marine-950">Paiements</h2>
            {(paiements ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-marine-500">Aucun paiement déclaré.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {(paiements ?? []).map((element) => {
                  const definition = statutPaiement(element.statut);
                  return (
                    <li
                      key={element.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-marine-100 px-3.5 py-2.5 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-marine-900">
                          {fcfa(element.montant_fcfa)} · {MOYENS_PAIEMENT[element.moyen]}
                        </p>
                        <p className="text-xs text-marine-500">
                          Réf. {element.reference_paiement ?? '—'} · {dateHeure(element.created_at)}
                        </p>
                      </div>
                      <Badge ton={definition.ton}>{definition.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-marine-950">Demandes de distribution</h2>
              <Link href="/admin/sorties" className="text-xs font-semibold text-azur-700 hover:underline">
                Toutes les demandes
              </Link>
            </div>
            {(sorties ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-marine-500">Aucune demande.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {(sorties ?? []).map((element) => {
                  const definition = statutSortie(element.statut);
                  return (
                    <li key={element.id}>
                      <Link
                        href={`/admin/sorties/${element.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-marine-100 px-3.5 py-2.5 text-sm transition hover:border-azur-200 hover:bg-azur-50/30"
                      >
                        <div>
                          <p className="font-semibold text-marine-900">
                            {element.titre || 'Sans titre'}
                          </p>
                          <p className="text-xs text-marine-500">
                            {element.type_sortie.toUpperCase()} · {dateCourte(element.updated_at)}
                          </p>
                        </div>
                        <Badge ton={definition.ton}>{definition.label}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
