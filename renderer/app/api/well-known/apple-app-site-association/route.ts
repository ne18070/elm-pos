import { NextResponse } from 'next/server';
import { APPLE_TEAM_ID, MOBILE_APP_BUNDLE_ID, MOBILE_APP_PATHS } from '@/lib/mobile-app';

// Servi sous /.well-known/apple-app-site-association (rewrite dans next.config.js).
// Apple le télécharge via son CDN pour activer les Universal Links de l'app « ELM Boutique ».
export const dynamic = 'force-static';

export function GET() {
  const appID = `${APPLE_TEAM_ID}.${MOBILE_APP_BUNDLE_ID}`;
  return NextResponse.json({
    applinks: {
      details: [
        {
          appIDs: [appID],
          components: MOBILE_APP_PATHS.map((path) => ({ '/': path })),
          // Format antérieur à iOS 13
          appID,
          paths: MOBILE_APP_PATHS,
        },
      ],
    },
  });
}
