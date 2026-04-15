import dynamic from 'next/dynamic';

// Client-only: the contract token is read at runtime via useParams().
// ssr: false avoids any server-side hydration issues in the static export.
const ContractSign = dynamic(() => import('./ContractSign'), { ssr: false });

// Next.js 14 requires prerenderRoutes.length > 0 (not just the function to exist).
// Tokens are runtime-generated; the placeholder satisfies the build check.
// The actual token is resolved client-side via useParams() at runtime.
export function generateStaticParams(): Array<{ token: string }> {
  return [{ token: 'sign' }];
}

export default function Page() {
  return <ContractSign />;
}
