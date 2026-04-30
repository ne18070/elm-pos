import { LocationConfirmationClient } from './client';

// Required for Next.js static export (output: 'export').
// Paths are unknown at build time; the client fetches data by token at runtime.
export function generateStaticParams(): Array<{ businessId: string; token: string }> {
  return [{ businessId: 'location', token: 'confirmation' }];
}

export default function Page() {
  return <LocationConfirmationClient />;
}
