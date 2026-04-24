import ConfirmationClient from './ConfirmationClient';

export function generateStaticParams(): Array<{ businessId: string; reference: string }> {
  return [{ businessId: 'juridique', reference: 'confirmation' }];
}

export default function Page() {
  return <ConfirmationClient />;
}
