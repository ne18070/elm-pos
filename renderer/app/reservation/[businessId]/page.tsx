import dynamic from 'next/dynamic';

const ReservationClient = dynamic(() => import('./ReservationClient'), { ssr: false });

export function generateStaticParams(): Array<{ businessId: string }> {
  return [{ businessId: 'reservation' }];
}

export default function Page() {
  return <ReservationClient />;
}