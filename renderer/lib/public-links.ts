const DEFAULT_PUBLIC_SITE_URL = 'https://www.elm-app.click';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

export function getPublicSiteUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredUrl) return trimTrailingSlash(configuredUrl);

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.startsWith('http') && !origin.includes('localhost')) {
      return trimTrailingSlash(origin);
    }
  }

  return DEFAULT_PUBLIC_SITE_URL;
}

export function buildPublicDocumentUrl(storagePath: string, bucket = 'product-images'): string {
  return buildSupabasePublicStorageUrl(bucket, storagePath);
}

export function buildSupabasePublicStorageUrl(bucket: string, storagePath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error('URL Supabase manquante');

  return `${trimTrailingSlash(supabaseUrl)}/storage/v1/object/public/${bucket}/${encodeStoragePath(storagePath)}`;
}
