import JuridiqueClient from './JuridiqueClient';

export function generateStaticParams(): Array<{ businessId: string }> {
  return [{ businessId: 'juridique' }];
}

export default function Page() {
  return <JuridiqueClient />;
}
