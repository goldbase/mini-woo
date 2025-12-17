// src/components/order-item.tsx
"use client";

import { useAppContext } from "@/providers/context-provider";
import Image from "next/image";
import { memo, useCallback } from "react";

interface OrderItemProps {
    id: number;
}

const OrderItem = memo(({ id }: OrderItemProps) => {
    const { state, dispatch } = useAppContext();

    const cartItem = state.cart.get(id);

    // Защита от отсутствующего товара (на всякий случай)
    if (!cartItem || !cartItem.product) {
        return null; // Или fallback UI: "Товар удалён"
    }

    const { product, count } = cartItem;

    // Безопасное извлечение цены (убираем HTML-теги)
    const rawPrice = product.price_html.replace(/<[^>]*>/g, "").trim();
    const currency = "₽"; // Можно парсить из price_html или WooCommerce settings

    // Обработчик клика по карточке (детальная страница + вибрация)
    const handleClick = useCallback(() => {
        dispatch({ type: "item", product });
        if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
            (globalThis as any).Telegram.WebApp.HapticFeedback.selectionChanged();
        }
    }, [dispatch, product]);

    const imageSrc = product.images[0]?.src || "/no-image.png";
    const imageAlt = product.images[0]?.alt || product.name || "Товар";

    return (
        <div
            className="order-item flex items-center gap-4 py-3 border-b border-gray-200 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={handleClick}
        >
            {/* Фото товара */}
            <div className="order-item-photo flex-shrink-0">
                <Image
                    src={imageSrc}
                    alt={imageAlt}
                    width={80}
                    height={80}
                    className="w-20 h-20 object-cover rounded-lg"
                    loading="lazy"
                    unoptimized // Для внешних изображений WooCommerce
                />
            </div>

            {/* Название и количество */}
            <div className="order-item-label flex-1 min-w-0">
                <div className="order-item-title flex justify-between items-start gap-2">
                    <div className="text-sm font-medium truncate">{product.name}</div>
                    <span className="order-item-counter text-sm font-bold text-gray-600 flex-shrink-0">
                        {count} ×
                    </span>
                </div>
                {/* Опционально: короткое описание (без dangerouslySetInnerHTML) */}
                {/* {product.short_description && (
                    <div
                        className="order-item-description text-xs text-gray-500 mt-1 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: product.short_description }}
                    />
                )} */}
            </div>

            {/* Цена */}
            <div className="order-item-price text-right">
                <div className="text-lg font-bold">{rawPrice} {currency}</div>
                {count > 1 && (
                    <div className="text-xs text-gray-500">
                        {Number(rawPrice.replace(/[^0-9.-]+/g, "")) * count} {currency}
                    </div>
                )}
            </div>
        </div>
    );
});

OrderItem.displayName = "OrderItem";

export default OrderItem;