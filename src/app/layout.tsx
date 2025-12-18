// src/app/layout.tsx
<link rel="icon" href="/favicon.ico" sizes="any" />
import './globals.css';
import { TelegramProvider } from "@/providers/telegram-provider";
import { ContextProvider } from "@/providers/context-provider";
import MobileBottomNav from "./mobile-bottom-nav"; // вынесем панель в отдельный файл

export const metadata = {
    title: 'ErgoSpine — магазин матрасов',
    description: 'Премиум матрасы и подушки Materasso в Telegram',
    robots: {
        index: false,
        follow: false,
    },
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
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