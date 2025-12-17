// src/components/store-item.tsx
"use client";

import { Product, useAppContext } from "@/providers/context-provider";
import Image from "next/image"; // Рекомендую Next/Image для lazy loading и оптимизации
import { memo, useCallback } from "react";

// Локализация (подготовка к next-intl или простая замена)
const ADD_LABEL = "В корзину"; // Позже заменится на useTranslations('StoreProduct.add')

interface StoreItemProps {
    product: Product;
}

const StoreItem = memo(({ product }: StoreItemProps) => {
    const { state, dispatch } = useAppContext();
    const cartItem = state.cart.get(product.id);

    // Безопасное извлечение цены (избегаем dangerouslySetInnerHTML)
    const price = product.price_html.replace(/<[^>]*>/g, ""); // Убираем HTML-теги
    const currency = "₽"; // Можно вытянуть из price_html или WooCommerce

    // Обработчики с useCallback — стабильные ссылки
    const handleAdd = useCallback(() => {
        dispatch({ type: "inc", product });
        // Вибрация для Telegram (улучшает UX)
        if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
            (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("light");
        }
    }, [dispatch, product]);

    const handleRemove = useCallback(() => {
        dispatch({ type: "dec", product });
    }, [dispatch, product]);

    const handleCardClick = useCallback(() => {
        dispatch({ type: "item", product }); // Открытие детальной страницы, если есть
    }, [dispatch, product]);

    const imageSrc = product.images[0]?.src || "/no-image.png";
    const imageAlt = product.images[0]?.alt || product.name || "Товар";

    return (
        <div className={`store-product ${cartItem ? "selected" : ""}`}>
            {/* Кликабельная область — карточка товара */}
            <div onClick={handleCardClick} className="cursor-pointer">
                <Image
                    src={imageSrc}
                    alt={imageAlt}
                    width={300}
                    height={300}
                    className="w-full h-auto object-cover rounded-lg"
                    loading="lazy"
                    unoptimized // Для внешних изображений с WooCommerce
                />
                <div className="store-product-label mt-2">
                    <span className="store-product-title block text-sm font-medium">
                        {product.name}
                    </span>
                    <span className="store-product-price block text-lg font-bold">
                        {price} {currency}
                    </span>
                </div>
            </div>

            {/* Счётчик (видим только если >0) */}
            {cartItem && cartItem.count > 0 && (
                <div className="store-product-counter font-bold text-lg">
                    {cartItem.count}
                </div>
            )}

            {/* Кнопки управления корзиной */}
            <div className="store-product-buttons flex justify-between mt-2">
                {cartItem && cartItem.count > 0 ? (
                    <button
                        onClick={handleRemove}
                        className="store-product-decr-button w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center text-xl"
                        aria-label="Уменьшить количество"
                    >
                        −
                    </button>
                ) : (
                    <div /> {/* Плейсхолдер для выравнивания */}
                )}

                <button
                    onClick={handleAdd}
                    className="store-product-incr-button px-4 py-2 bg-green-600 text-white rounded-lg font-medium"
                    aria-label="Добавить в корзину"
                >
                    <span className="button-item-label">{ADD_LABEL}</span>
                </button>
            </div>
        </div>
    );
});

StoreItem.displayName = "StoreItem";

// Скелетон — улучшенный с анимацией пульсации
export const StoreItemSkeleton = memo(() => {
    return (
        <div className="store-product animate-pulse">
            <div className="bg-gray-300 rounded-lg w-full h-48" />
            <div className="mt-2 space-y-2">
                <div className="bg-gray-300 h-4 rounded w-3/4" />
                <div className="bg-gray-300 h-6 rounded w-1/2" />
            </div>
            <div className="mt-4 flex justify-end">
                <div className="bg-gray-300 h-10 w-28 rounded-lg" />
            </div>
        </div>
    );
});

StoreItemSkeleton.displayName = "StoreItemSkeleton";

export default StoreItem;