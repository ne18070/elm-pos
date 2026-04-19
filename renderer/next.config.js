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
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    // unsafe-inline and unsafe-eval are required by Next.js App Router.
    // frame-ancestors replaces X-Frame-Options and must be an HTTP header (meta tag is ignored).
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
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
      return [{ source: '/(.*)', headers: securityHeaders }];
    },
  }),

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

    return config;
  },
};

module.exports = nextConfig;
