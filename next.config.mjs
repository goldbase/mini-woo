// next.config.mjs
// Обратите внимание на расширение .mjs — это ES Module, полностью совместим с Next.js 13+

import withNextIntl from 'next-intl/plugin';
const nextIntlPlugin = withNextIntl('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Обязательно для Vercel: standalone output — минимизирует размер бандла, ускоряет cold start
  output: "standalone",

  // Оптимизация изображений из WooCommerce (ergospine.ru)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ergospine.ru",
        port: "",
        pathname: "/**",
      },
    ],
    unoptimized: true, // Критично для внешних изображений WooCommerce
  },

  // Полные URL в логах Vercel — удобно для отладки proxy
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // Security headers (OWASP)
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; img-src 'self' https: data:; style-src 'self' 'unsafe-inline';" },
      ],
    },
  ],

  compress: true,
  trailingSlash: false,
};

export default nextIntlPlugin(nextConfig);