import { findPublicBusinessByRef } from './public-business-ref';

export interface PublicBusinessInfo {
  id: string;
  name: string;
  logo_url: string | null;
  currency: string;
  phone: string | null;
  address: string | null;
}

export async function getPublicBusinessInfo(businessRef: string): Promise<PublicBusinessInfo | null> {
  return findPublicBusinessByRef<PublicBusinessInfo>(
    businessRef,
    'id, name, logo_url, currency, phone, address'
  );
}
