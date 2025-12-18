// src/app/page.tsx
"use client";

import { useCallback, useEffect } from "react";
import { useTelegram } from "@/providers/telegram-provider";
import { useAppContext } from "@/providers/context-provider";

import StoreFront from "@/components/store-front";
import OrderOverview from "@/components/order-overview";
import ProductOverview from "@/components/product-overview";
import CheckoutForm from "@/components/checkout-form";

export default function Home() {
  const { webApp, user } = useTelegram();
  const { state, dispatch } = useAppContext();

  // Оставляем: это твой текущий flow (инвойс/оплата) — но теперь вызов будет не из режима "order",
  // а когда ты реально решишь запускать оплату (например, после создания заказа).
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

  // ===== MainButton + BackButton =====
  useEffect(() => {
    if (!webApp) return;

    // 1) MainButton: разные режимы
    if (state.mode === "storefront") {
      webApp.MainButton.setParams({
        text: "ПЕРЕЙТИ К ЗАКАЗУ",
        color: "#00d0b8",
        text_color: "#0b182f",
        is_visible: true,
      });

      const cb = () => dispatch({ type: "order" });
      webApp.MainButton.onClick(cb);

      // BackButton
      if (webApp.isVersionAtLeast("7.2")) webApp.BackButton.hide();

      return () => {
        webApp.MainButton.offClick(cb);
      };
    }

    if (state.mode === "order") {
      webApp.MainButton.setParams({
        text: "ОФОРМИТЬ",
        color: "#00d0b8",
        text_color: "#0b182f",
        is_visible: true,
      });

      const cb = () => dispatch({ type: "checkout" }); // ✅ вместо handleCheckout
      webApp.MainButton.onClick(cb);

      // BackButton: из корзины → каталог
      if (webApp.isVersionAtLeast("7.2")) {
        const back = () => dispatch({ type: "storefront" });
        webApp.BackButton.onClick(back);
        webApp.BackButton.show();

        return () => {
          webApp.MainButton.offClick(cb);
          webApp.BackButton.offClick(back);
        };
      }

      return () => {
        webApp.MainButton.offClick(cb);
      };
    }

    if (state.mode === "checkout") {
      // В checkout лучше НЕ использовать MainButton Telegram,
      // потому что форма уже имеет свою кнопку submit и валидируется.
      webApp.MainButton.hide();

      // BackButton: из checkout → корзина
      if (webApp.isVersionAtLeast("7.2")) {
        const back = () => dispatch({ type: "order" });
        webApp.BackButton.onClick(back);
        webApp.BackButton.show();

        return () => {
          webApp.BackButton.offClick(back);
        };
      }

      return;
    }

    // item / прочее
    webApp.MainButton.hide();

    if (webApp.isVersionAtLeast("7.2")) {
      const back = () => dispatch({ type: "storefront" });
      webApp.BackButton.onClick(back);
      webApp.BackButton.show();

      return () => {
        webApp.BackButton.offClick(back);
      };
    }
  }, [webApp, state.mode, dispatch, handleCheckout]);

  // ===== Closing confirmation =====
  useEffect(() => {
    if (!webApp || !webApp.isVersionAtLeast("7.0")) return;

    if (state.cart.size > 0) webApp.enableClosingConfirmation();
    else webApp.disableClosingConfirmation();
  }, [webApp, state.cart.size]);

  return (
    <main className={`${state.mode}-mode`}>
      <StoreFront />
      <ProductOverview />
      <OrderOverview />
      {state.mode === "checkout" && <CheckoutForm />}
    </main>
  );
}
