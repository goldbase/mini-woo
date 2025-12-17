// src/app/page.tsx
"use client";

import { useCallback, useEffect } from "react";
import { useTelegram } from "@/providers/telegram-provider";
import { useAppContext } from "@/providers/context-provider";
import StoreFront from "@/components/store-front";
import OrderOverview from "@/components/order-overview";
import ProductOverview from "@/components/product-overview";

// Отключаем статическую генерацию — страница динамическая (критично для onClick)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
    const { webApp, user } = useTelegram();
    const { state, dispatch } = useAppContext();

    const handleCheckout = useCallback(async () => {
        if (!webApp) return;

        webApp.MainButton.showProgress(true);

        const invoiceSupported = webApp.isVersionAtLeast("6.1");

        const items = Array.from(state.cart.values()).map((item) => ({
            id: item.product.id,
            variationId: (item.product as any).variationId || undefined,
            count: item.count,
        }));

        const body = JSON.stringify({
            userId: user?.id ?? null,
            chatId: webApp.initDataUnsafe.chat?.id ?? null,
            username: user?.username ?? null,
            invoiceSupported,
            comment: state.comment ?? "",
            shippingZone: state.shippingZone,
            items,
        });

        try {
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error("Order creation error:", res.status, errorData);
                webApp.showAlert("Ошибка при создании заказа. Попробуйте позже.");
                webApp.MainButton.hideProgress();
                return;
            }

            const result = await res.json();

            if (invoiceSupported && result.invoice_link) {
                webApp.openInvoice(result.invoice_link, (status) => {
                    webApp.MainButton.hideProgress();
                    if (status === "paid") {
                        webApp.HapticFeedback.notificationOccurred("success");
                        webApp.showAlert("Оплата прошла успешно! Заказ оформлен.");
                        webApp.close();
                    } else if (status === "failed") {
                        webApp.HapticFeedback.notificationOccurred("error");
                        webApp.showAlert("Оплата не удалась.");
                    } else if (status === "cancelled") {
                        webApp.HapticFeedback.notificationOccurred("warning");
                        webApp.showAlert("Оплата отменена.");
                    }
                });
            } else {
                webApp.showAlert("Заказ успешно создан! Мы свяжемся с вами.");
                webApp.MainButton.hideProgress();
                webApp.close();
            }
        } catch (error) {
            console.error("Checkout error:", error);
            webApp.showAlert("Ошибка сети. Проверьте подключение.");
            webApp.MainButton.hideProgress();
        }
    }, [webApp, user, state.cart, state.comment, state.shippingZone]);

    useEffect(() => {
        if (!webApp) return;

        const mainButtonText = state.mode === "order" ? "ОПЛАТИТЬ ЗАКАЗ" : "ПЕРЕЙТИ К ЗАКАЗУ";

        webApp.MainButton.setParams({
            text: mainButtonText,
            color: "#00d0b8",
            text_color: "#0b182f",
        });

        const mainCallback = state.mode === "order" ? handleCheckout : () => dispatch({ type: "order" });
        webApp.MainButton.onClick(mainCallback);

        const backCallback = () => dispatch({ type: "storefront" });
        webApp.BackButton.onClick(backCallback);

        return () => {
            webApp.MainButton.offClick(mainCallback);
            webApp.BackButton.offClick(backCallback);
        };
    }, [webApp, state.mode, handleCheckout]);

    useEffect(() => {
        if (!webApp) return;

        if (state.mode === "storefront") {
            webApp.BackButton.hide();
        } else {
            webApp.BackButton.show();
        }
    }, [webApp, state.mode]);

    useEffect(() => {
        if (!webApp) return;

        if (state.cart.size > 0) {
            webApp.MainButton.show();
            webApp.enableClosingConfirmation();
        } else {
            webApp.MainButton.hide();
            webApp.disableClosingConfirmation();
        }
    }, [webApp, state.cart.size]);

    return (
        <main className={`${state.mode}-mode`}>
            <StoreFront />
            <ProductOverview />
            <OrderOverview />
        </main>
    );
}