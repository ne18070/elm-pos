const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },

  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Aliases pour les modules hors du dossier renderer/
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
