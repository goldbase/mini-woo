// src/app/mobile-bottom-nav.tsx
"use client";

import { memo, useCallback } from "react";

const MobileBottomNav = memo(() => {
    const handlePhoneCall = useCallback(() => {
        const phone = "+79204002404";
        const url = `tel:${phone}`;

        if ((globalThis as any).Telegram?.WebApp?.openLink) {
            (globalThis as any).Telegram.WebApp.openLink(url);
        } else {
            window.location.href = url;
        }

        if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
            (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("medium");
        }
    }, []);

    return (
        <div className="mobile-bottom-nav2025">
            <div className="mobile-nav-item active">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <span>Каталог</span>
            </div>

            <div className="mobile-nav-item">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="21" r="1"></circle>
                    <circle cx="20" cy="21" r="1"></circle>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                <span>Корзина</span>
            </div>

            <div className="mobile-nav-item phone-big" onClick={handlePhoneCall}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0b182f" strokeWidth="2.5">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
            </div>
        </div>
    );
});

MobileBottomNav.displayName = "MobileBottomNav";

export default MobileBottomNav;