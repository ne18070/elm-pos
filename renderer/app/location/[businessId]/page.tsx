import { LocationPageClient } from './client';

// Required for Next.js static export (output: 'export').
// businessId is resolved at runtime via client-side navigation.
export function generateStaticParams(): Array<{ businessId: string }> {
  return [{ businessId: 'location' }];
}

export default function Page() {
  return <LocationPageClient />;
}
