import dynamic from 'next/dynamic';

const ConfirmationClient = dynamic(() => import('./ConfirmationClient'), { ssr: false });

export function generateStaticParams(): Array<{ businessId: string; token: string }> {
  return [{ businessId: 'reservation', token: 'confirmation' }];
}

export default function Page() {
  return <ConfirmationClient />;
}