import OwnerVehicleReportClient from './OwnerVehicleReportClient';

export function generateStaticParams(): Array<{ token: string }> {
  return [{ token: 'view' }];
}

export default async function OwnerVehicleReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <OwnerVehicleReportClient token={token} />;
}
