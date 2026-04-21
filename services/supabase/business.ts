import { supabase } from './client';
import type { Business, Organization, UserRole, BusinessType } from '../../types';

export interface BusinessMembership {
  business: Business;
  role: UserRole;
}

export interface BusinessMember {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  role: UserRole;
  joined_at: string;
}

export interface OrganizationWithBusinesses extends Organization {
  owner_name?: string;
  owner_email?: string;
  businesses: Business[];
}

// ─── Organizations ────────────────────────────────────────────────────────────

/** Toutes les organizations (superadmin) avec leurs établissements */
export async function getAllOrganizationsAdmin(): Promise<OrganizationWithBusinesses[]> {
  const { data, error } = await (supabase as any)
    .rpc('get_all_organizations_admin');
  if (error) throw new Error(error.message);

  return ((data as any[]) ?? []).map((row: any) => ({
    id:           row.id,
    legal_name:   row.legal_name,
    denomination: row.denomination,
    rib:          row.rib,
    owner_id:     row.owner_id,
    owner_name:   row.owner_name ?? undefined,
    owner_email:  row.owner_email ?? undefined,
    currency:     row.currency,
    country:      row.country,
    created_at:   row.created_at,
    businesses:   (row.businesses ?? []) as Business[],
  }));
}

/** Établissements sans organization (superadmin) */
export async function getUnassignedBusinesses(): Promise<Business[]> {
  const { data, error } = await (supabase as any)
    .from('businesses')
    .select('*')
    .is('organization_id', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Business[];
}

/** Créer une organization depuis le backoffice superadmin */
export async function createOrganizationAdmin(data: {
  legal_name: string;
  denomination?: string;
  rib?: string;
  currency?: string;
  country?: string;
}): Promise<Organization> {
  const { data: result, error } = await (supabase as any)
    .from('organizations')
    .insert({
      legal_name:   data.legal_name,
      denomination: data.denomination || null,
      rib:          data.rib || null,
      currency:     data.currency || 'XOF',
      country:      data.country || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return result as Organization;
}

/** Mettre à jour une organization */
export async function updateOrganization(
  orgId: string,
  patch: Partial<Organization>
): Promise<void> {
  const { error } = await (supabase as any)
    .from('organizations')
    .update(patch)
    .eq('id', orgId);
  if (error) throw new Error(error.message);
}

/** Créer un business standalone depuis le backoffice et l'associer à une org */
export async function createOrganization(data: {
  name: string;
  type: BusinessType;
  denomination?: string;
  rib?: string;
  currency?: string;
  tax_rate?: number;
  address?: string;
  phone?: string;
  email?: string;
}): Promise<Business> {
  let features: string[] = [];
  if (data.type === 'retail')      features = ['retail', 'stock', 'expenses'];
  else if (data.type === 'restaurant') features = ['restaurant', 'retail', 'stock', 'expenses'];
  else if (data.type === 'hotel')  features = ['hotel', 'retail', 'expenses'];
  else if (data.type === 'service') features = ['legal', 'expenses'];

  const { data: result, error } = await (supabase as any)
    .from('businesses')
    .insert({
      ...data,
      currency: data.currency || 'XOF',
      tax_rate: data.tax_rate || 0,
      features,
      types: [data.type],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result as Business;
}

// ─── Multi-établissements ─────────────────────────────────────────────────────

/** Tous les établissements auxquels l'utilisateur connecté appartient */
export async function getMyBusinesses(): Promise<BusinessMembership[]> {
  const { data, error } = await supabase.rpc('get_my_businesses');
  if (error) throw new Error(error.message);

  return (data as unknown as any[]).map((row) => ({
    business: {
      id:                row.id,
      name:              row.name,
      type:              row.type,
      denomination:      row.denomination,
      rib:               row.rib,
      brand_config:      row.brand_config,
      types:             row.types    ?? [],
      features:          row.features ?? [],
      address:           row.address,
      phone:             row.phone,
      email:             row.email,
      logo_url:          row.logo_url,
      currency:          row.currency,
      tax_rate:          row.tax_rate,
      tax_inclusive:     row.tax_inclusive ?? false,
      receipt_footer:    row.receipt_footer,
      stock_units:       row.stock_units,
      webhook_whitelist: row.webhook_whitelist,
      owner_id:          row.owner_id,
      organization_id:   row.organization_id   ?? null,
      organization_name: row.organization_name ?? null,
      created_at:        row.created_at,
    } as Business,
    role: row.member_role,
  }));
}

/** Mettre à jour les informations d'un établissement */
export async function updateBusiness(
  businessId: string,
  patch: Partial<Business>
): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update(patch)
    .eq('id', businessId);
  if (error) throw new Error(error.message);
}

/** Basculer vers un autre établissement (met à jour le contexte RLS) */
export async function switchBusiness(businessId: string): Promise<void> {
  const { error } = await supabase.rpc('switch_business', {
    p_business_id: businessId,
  });
  if (error) throw new Error(error.message);
}

/** Créer un nouvel établissement rattaché à l'org du propriétaire */
export async function createBusiness(data: {
  name: string;
  denomination?: string;
  type: string;
  currency: string;
  tax_rate: number;
}): Promise<Business> {
  const { data: result, error } = await supabase.rpc('create_business', {
    business_data: data,
  });
  if (error) throw new Error(error.message);
  return result as unknown as Business;
}

// ─── Gestion des membres ──────────────────────────────────────────────────────

export async function getBusiness(businessId: string): Promise<Business> {
  const { data, error } = await supabase
    .from('businesses').select('*').eq('id', businessId).single();
  if (error) throw new Error(error.message);
  return data as unknown as Business;
}

export async function getBusinessMembers(businessId: string): Promise<BusinessMember[]> {
  const { data, error } = await supabase.rpc('get_business_members', {
    p_business_id: businessId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as BusinessMember[];
}

export async function setMemberRole(
  businessId: string,
  userId: string,
  role: UserRole
): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', {
    p_business_id: businessId,
    p_user_id:     userId,
    p_role:        role,
  });
  if (error) throw new Error(error.message);
}

export async function removeBusinessMember(
  businessId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('remove_business_member', {
    p_business_id: businessId,
    p_user_id:     userId,
  });
  if (error) throw new Error(error.message);
}

/** @deprecated — utiliser getAllOrganizationsAdmin() pour le backoffice */
export async function getAllOrganizations(): Promise<Business[]> {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Business[];
}
