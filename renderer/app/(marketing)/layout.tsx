import { MarketingNav } from '@/components/marketing/MarketingNav';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNav />
      {children}
    </>
  );
}
