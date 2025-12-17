// src/components/store-item.tsx
"use client";

import { Product, useAppContext } from "@/providers/context-provider";
import Image from "next/image";
import { memo, useCallback } from "react";

interface StoreItemProps {
    product: Product;
}

const StoreItem = memo(({ product }: StoreItemProps) => {
    const { state, dispatch } = useAppContext();
    const cartItem = state.cart.get(product.id);

    const handleAdd = useCallback(() => {
        dispatch({ type: "inc", product });
        if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
            (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("light");
        }
    }, [dispatch, product]);

    const handleRemove = useCallback(() => {
        dispatch({ type: "dec", product });
        if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
            (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("medium");
        }
    }, [dispatch, product]);

    const handleCardClick = useCallback(() => {
        dispatch({ type: "item", product });
        if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
            (globalThis as any).Telegram.WebApp.HapticFeedback.selectionChanged();
        }
    }, [dispatch, product]);

    const imageSrc = product.images[0]?.src || "/no-image.png";
    const imageAlt = product.images[0]?.alt || product.name || "Товар";

    // Безопасная цена + форматирование с пробелами
    const rawPrice = product.price_html.replace(/<[^>]*>/g, "").trim();
    const numericPrice = Number(rawPrice.replace(/[^0-9.-]+/g, ""));
    const formattedPrice = isNaN(numericPrice) ? rawPrice : numericPrice.toLocaleString("ru-RU");

    return (
        <div className={`store-product ${cartItem ? "selected" : ""}`}>
            <div
                onClick={handleCardClick}
                className="cursor-pointer"
                role="button"
                aria-label={`Просмотр детали товара ${product.name}`}
            >
                <Image
                    src={imageSrc}
                    alt={imageAlt}
                    width={300}
                    height={300}
                    className="w-full h-auto object-cover rounded-lg"
                    loading="lazy"
                    unoptimized
                />
                <div className="store-product-label mt-2">
                    <span className="store-product-title block text-sm font-medium">
                        {product.name}
                    </span>
                    <span className="store-product-price block text-lg font-bold">
                        {formattedPrice} ₽
                    </span>
                </div>
            </div>

            {cartItem && cartItem.count > 0 && (
                <div className="store-product-counter font-bold text-lg">
                    {cartItem.count}
                </div>
            )}

            <div className="store-product-buttons flex justify-between mt-2">
                {cartItem && cartItem.count > 0 ? (
                    <button
                        onClick={handleRemove}
                        className="store-product-decr-button w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center text-xl hover:bg-red-600 transition-colors"
                        aria-label="Уменьшить количество"
                    >
                        −
                    </button>
                ) : (
                    <div className="w-10 h-10" />
                )}

                <button
                    onClick={handleAdd}
                    className="store-product-incr-button px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                    aria-label="Добавить в корзину"
                >
                    <span className="button-item-label">
                        {cartItem ? "Ещё" : "В корзину"}
                    </span>
                </button>
            </div>
        </div>
    );
});

StoreItem.displayName = "StoreItem";

export const StoreItemSkeleton = memo(() => (
    <div className="store-product animate-pulse">
        <div className="bg-gray-300 rounded-lg w-full aspect-square" />
        <div className="mt-2 space-y-2">
            <div className="bg-gray-300 h-4 rounded w-4/5" />
            <div className="bg-gray-300 h-6 rounded w-3/5" />
        </div>
        <div className="mt-4 flex justify-end">
            <div className="bg-gray-300 h-10 w-32 rounded-lg" />
        </div>
    </div>
));

StoreItemSkeleton.displayName = "StoreItemSkeleton";

export default StoreItem;