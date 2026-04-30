import dynamic from 'next/dynamic';

const BoutiqueClient = dynamic(() => import('./BoutiqueClient'), { ssr: false });

export function generateStaticParams(): Array<{ businessId: string }> {
  return [{ businessId: 'boutique' }];
}

export default function Page() {
  return <BoutiqueClient />;
}