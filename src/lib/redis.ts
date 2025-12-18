// src/lib/redis.ts
import Redis from 'ioredis';

// Конфигурация подключения к локальному Redis на VPS
const redis = new Redis({
  host: '127.0.0.1',      // localhost — безопасно, внешний доступ запрещён
  port: 6379,
  // password: process.env.REDIS_PASSWORD, // раскомментируйте, если включили auth в redis.conf
  db: 0,                  // база по умолчанию
  lazyConnect: true,      // подключение только при первом использовании (экономия ресурсов)
  retryStrategy: (times) => {
    // Автоматический реконнект с экспоненциальной задержкой (max 2 сек)
    return Math.min(times * 50, 2000);
  },
  maxRetriesPerRequest: 3, // ограничение попыток на запрос
});

// Логирование событий (удобно для отладки на VPS)
redis.on('connect', () => {
  console.log('Redis: подключение установлено');
});

redis.on('ready', () => {
  console.log('Redis: готов к работе');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('close', () => {
  console.log('Redis: соединение закрыто');
});

redis.on('reconnecting', () => {
  console.log('Redis: переподключение...');
});

// Экспорт единого экземпляра (singleton — оптимально для Next.js)
export default redis;