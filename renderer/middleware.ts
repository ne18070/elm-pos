import { NextRequest, NextResponse } from 'next/server';

export function middleware(_req: NextRequest) {
  // Auth is handled client-side by AuthProvider (session lives in localStorage).
  // Server-side cookie checks are incompatible with that storage — let all requests through.
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|site\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
