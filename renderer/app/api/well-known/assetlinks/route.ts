import { NextResponse } from 'next/server';
import { MOBILE_APP_BUNDLE_ID } from '@/lib/mobile-app';

// Servi sous /.well-known/assetlinks.json (rewrite dans next.config.js).
// Google le vérifie pour ouvrir les liens /boutique et /services directement dans l'app.
//
// ANDROID_SHA256_CERT_FINGERPRINTS (variable d'environnement Vercel), séparées par des virgules :
// Play Console → Intégrité de l'application → Signature d'application →
//   SHA-256 du « certificat de la clé de signature d'application »
//   + SHA-256 du « certificat de la clé d'importation » (builds hors Play Store)
export const dynamic = 'force-static';

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  // Sans empreinte, aucune association : les liens restent ouverts dans le navigateur
  if (fingerprints.length === 0) return NextResponse.json([]);

  return NextResponse.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: MOBILE_APP_BUNDLE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
