import type { Metadata } from 'next';
import { MarketingNav } from '@/components/marketing/MarketingNav';

// Canonique de la landing (page client, sans metadata propre). Les pages enfants
// indexables (privacy, conditions, subscribe) déclarent la leur.
export const metadata: Metadata = {
  alternates: { canonical: 'https://www.elm-app.click' },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNav />
      {children}
    </>
  );
}
