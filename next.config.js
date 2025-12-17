// next.config.js

const withNextIntl = require('next-intl/plugin')('./i18n.ts');

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
      // Добавьте другие домены при необходимости (например, CDN)
    ],
    // Для внешних изображений из WooCommerce рекомендуется отключить оптимизацию Next.js
    // Иначе может быть долгая загрузка или ошибки с AVIF/WebP
    unoptimized: true,
  },

  // Полные URL запросов в логах Vercel — удобно для отладки proxy к WooCommerce
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // Базовые security headers (OWASP рекомендация)
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

  // Дополнительные оптимизации (рекомендую)
  // Сжатие ответов (gzip/brotli) — ускоряет загрузку в Telegram
  compress: true,

  // Отключаем trailing slash (не нужен для Mini App)
  trailingSlash: false,

  // Увеличиваем таймауты для медленных запросов к WooCommerce (если товаров много)
  // experimental: {
  //   serverComponentsExternalPackages: ["some-heavy-package"], // если используете внешние пакеты в server components
  // },
};

module.exports = withNextIntl(nextConfig);