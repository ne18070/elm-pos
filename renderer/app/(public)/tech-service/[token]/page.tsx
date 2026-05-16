import TechnicianServiceWorkspace from './TechnicianServiceWorkspace';

// Required for Next.js static export (output: 'export').
// The token is resolved at runtime via client-side logic.
export function generateStaticParams(): Array<{ token: string }> {
  return [{ token: 'public' }];
}

export default function TechnicianServicePage() {
  return <TechnicianServiceWorkspace />;
}
