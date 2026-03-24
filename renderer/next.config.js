const path = require('path');

// Electron build: static export (output: 'export')
// Web build:     standard Next.js server (no static export)
const isElectron = process.env.ELECTRON_BUILD === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isElectron ? { output: 'export', trailingSlash: true } : {}),
  images: { unoptimized: isElectron },

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
