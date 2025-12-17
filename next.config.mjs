// next.config.mjs
import withNextIntl from 'next-intl/plugin';

const nextIntlPlugin = withNextIntl('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ergospine.ru",
        pathname: "/**",
      },
    ],
  },
  logging: {
    fetches: { fullUrl: true },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self';",
          },
        ],
      },
    ];
  },
  compress: true,
  trailingSlash: false,
};

export default nextIntlPlugin(nextConfig);