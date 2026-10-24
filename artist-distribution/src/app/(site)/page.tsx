import type { Metadata } from 'next';
import { Hero } from '@/components/marketing/hero';
import { BandeauPlateformes } from '@/components/marketing/bandeau-plateformes';
import { SectionAvantages } from '@/components/marketing/section-avantages';
import { SectionFonctionnement } from '@/components/marketing/section-fonctionnement';
import { SectionFormules } from '@/components/marketing/section-formules';
import { SectionFaq } from '@/components/marketing/section-faq';
import { CtaFinal } from '@/components/marketing/cta-final';
import { getFormulesPubliques } from '@/lib/plans';
import { site } from '@/config/site';

export const revalidate = 60;

export const metadata: Metadata = {
  title: `${site.slogan}`,
  description: site.description,
  alternates: { canonical: '/' },
};

export default async function PageAccueil() {
  const formules = await getFormulesPubliques();

  return (
    <>
      <Hero />
      <BandeauPlateformes />
      <SectionAvantages />
      <SectionFonctionnement />
      <SectionFormules formules={formules} />
      <SectionFaq />
      <CtaFinal />
    </>
  );
}
