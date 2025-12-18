// i18n.ts
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // Получаем язык из Telegram WebApp (если доступно) или заголовка
  const locale = (globalThis as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'ru';

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});