const path = require('path');

// Electron build: static export (output: 'export')
// Web build:     standard Next.js server (no static export)
const isElectron = process.env.ELECTRON_BUILD === '1';

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self)',
  },
  {
    // unsafe-inline and unsafe-eval are required by Next.js App Router.
    // frame-ancestors replaces X-Frame-Options and must be an HTTP header (meta tag is ignored).
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://api.qrserver.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:11434 http://localhost:11434",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isElectron ? { output: 'export', trailingSlash: true } : {}),
  images: { unoptimized: isElectron },
  ...(isElectron ? {} : {
    async headers() {
      return [
        { source: '/(.*)', headers: securityHeaders },
        {
          source: '/api/v1/(.*)',
          headers: [
            { key: 'Access-Control-Allow-Origin',  value: '*' },
            { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
            { key: 'Access-Control-Allow-Headers', value: 'Content-Type, X-API-Key' },
          ],
        },
      ];
    },
  }),

  env: {
    SUPABASE_URL:                  process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY:             process.env.SUPABASE_ANON_KEY             || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL:          process.env.NEXT_PUBLIC_SITE_URL          || 'https://www.elm-app.click',
    NEXT_PUBLIC_LOCAL_AI_BASE_URL: process.env.NEXT_PUBLIC_LOCAL_AI_BASE_URL || 'http://127.0.0.1:11434',
    NEXT_PUBLIC_LOCAL_AI_MODEL:    process.env.NEXT_PUBLIC_LOCAL_AI_MODEL    || 'llama3.2:3b',
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@services': path.resolve(__dirname, '../services'),
      '@domain':   path.resolve(__dirname, '../domain'),
      '@pos-types':path.resolve(__dirname, '../types/index'),
    };

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false, net: false, tls: false,
      crypto: false, path: false, os: false,
      stream: false, child_process: false,
    };

    // jspdf optional peer deps — not used, stub them out so webpack doesn't fail
    config.resolve.alias['canvg']       = false;
    config.resolve.alias['html2canvas'] = false;
    // NOTE: dompurify is NOT stubbed — the app uses it directly in contract views

    return config;
  },
};

module.exports = nextConfig;
