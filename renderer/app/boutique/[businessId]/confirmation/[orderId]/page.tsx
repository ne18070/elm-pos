import dynamic from 'next/dynamic';

const ConfirmationClient = dynamic(() => import('./ConfirmationClient'), { ssr: false });

export function generateStaticParams(): Array<{ businessId: string; orderId: string }> {
  return [{ businessId: 'boutique', orderId: 'confirmation' }];
}

export default function Page() {
  return <ConfirmationClient />;
}