import { NextResponse } from 'next/server';
import { buildSupabasePublicStorageUrl } from '@/lib/public-links';

const DOCUMENTS_BUCKET = 'product-images';

export function GET(
  _request: Request,
  { params }: { params: { path?: string[] } }
) {
  const storagePath = params.path?.join('/');

  if (!storagePath) {
    return NextResponse.json({ error: 'Chemin du document manquant' }, { status: 400 });
  }

  return NextResponse.redirect(buildSupabasePublicStorageUrl(DOCUMENTS_BUCKET, storagePath), 302);
}
