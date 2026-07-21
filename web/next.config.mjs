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
    return config;
  },
};

export default nextConfig;
