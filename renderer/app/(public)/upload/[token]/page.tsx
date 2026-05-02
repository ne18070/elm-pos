import dynamic from 'next/dynamic';

const PublicUploadView = dynamic(() => import('./PublicUploadView'), { ssr: false });

export function generateStaticParams(): Array<{ token: string }> {
  return [{ token: 'demo' }];
}

export default function Page() {
  return <PublicUploadView />;
}
