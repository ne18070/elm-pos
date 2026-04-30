import PublicServiceOrderClient from './PublicServiceOrderClient';

export function generateStaticParams(): Array<{ businessId: string }> {
  return [{ businessId: 'demo' }];
}

export default function PublicServiceOrderPage() {
  return <PublicServiceOrderClient />;
}
