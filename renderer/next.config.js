/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Disable server features for Electron static export
  experimental: {
    // Required for App Router with static export
  },
  // Webpack config for Electron compatibility
  webpack: (config, { isServer }) => {
    // Exclude Electron and Node modules from renderer bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
        stream: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
