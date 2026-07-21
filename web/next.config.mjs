/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,
  experimental: {
    // The engine lives one directory up (../src) — compile it directly, no package linking.
    externalDir: true,
  },
  webpack: (config) => {
    // Engine source uses NodeNext ".js" import specifiers; map them onto .ts sources.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
    };
    // Engine files live in ../src; on Vercel only web/node_modules exists, and upward
    // resolution from ../src would miss it. Make web's node_modules a global fallback.
    config.resolve.modules = [...(config.resolve.modules ?? ['node_modules']), new URL('./node_modules', import.meta.url).pathname];
    return config;
  },
};

export default nextConfig;
