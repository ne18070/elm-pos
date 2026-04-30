import { VoituresPublicClient } from './VoituresClient';

export function generateStaticParams(): Array<{ businessId: string }> {
  return [{ businessId: 'voitures' }];
}

export default function Page() {
  return <VoituresPublicClient />;
}
