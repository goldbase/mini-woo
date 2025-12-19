// src/app/layout.tsx
import "./globals.css";
import "@/styles/product-overview.css"; // ✅ важно: чтобы CSS попал в production bundle

import { TelegramProvider } from "@/providers/telegram-provider";
import { ContextProvider } from "@/providers/context-provider";
import MobileBottomNav from "./mobile-bottom-nav";

export const metadata = {
  title: "ErgoSpine — магазин матрасов",
  description: "Премиум матрасы и подушки Materasso в Telegram",
  robots: {
    index: false,
    follow: false,
  },
  // ✅ favicon правильно задаётся так
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <TelegramProvider>
          <ContextProvider>
            {children}
            <MobileBottomNav />
          </ContextProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}
