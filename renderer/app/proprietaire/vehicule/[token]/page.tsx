import OwnerVehicleReportClient from './OwnerVehicleReportClient';

export default async function OwnerVehicleReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <OwnerVehicleReportClient token={token} />;
}
