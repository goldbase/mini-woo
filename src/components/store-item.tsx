// src/components/store-item.tsx
"use client";

import { Product, useAppContext } from "@/providers/context-provider";
import Image from "next/image";
import { memo, useCallback, useState, useEffect, useMemo } from "react";

// Тип вариации (из WooCommerce REST API)
interface Variation {
    id: number;
    price_html: string;
    attributes: Array<{
        name: string;
        option: string;
    }>;
    image?: {
        src: string;
    };
}

interface StoreItemProps {
    product: Product;
}

const StoreItem = memo(({ product }: StoreItemProps) => {
    const { state, dispatch } = useAppContext();
    const cartItem = state.cart.get(product.id);

    // Выбранная вариация
    const [selectedVariation, setSelectedVariation] = useState<Variation | null>(null);

    // Автовыбор первой вариации для variable товаров
    useEffect(() => {
        if (product.type === "variable" && product.variations && product.variations.length > 0) {
            setSelectedVariation(product.variations[0]);
        } else {
            setSelectedVariation(null);
        }
    }, [product.type, product.variations]);

    // Товар для добавления (вариация или основной)
    const itemToAdd = useMemo(() => selectedVariation || product, [selectedVariation, product]);

    // Обработчики с haptic
    const handleAdd = useCallback(() => {
        dispatch({ type: "inc", product: itemToAdd });
        if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
            (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("light");
        }
    }, [dispatch, itemToAdd]);

    const handleRemove = useCallback(() => {
        dispatch({ type: "dec", product: itemToAdd });
        if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
            (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("medium");
        }
    }, [dispatch, itemToAdd]);

    const handleCardClick = useCallback(() => {
        dispatch({ type: "item", product: itemToAdd });
    }, [dispatch, itemToAdd]);

    // Изображение с fallback
    const imageSrc = useMemo(() => {
        const img = itemToAdd.images?.[0];
        return img?.src || img?.thumbnail || "/no-image.png";
    }, [itemToAdd.images]);

    const imageAlt = itemToAdd.images?.[0]?.alt || itemToAdd.name || "Товар";

    // Форматированная цена
    const formattedPrice = useMemo(() => {
        const raw = (selectedVariation?.price_html || product.price_html || "").replace(/<[^>]*>/g, "").trim();
        const num = Number(raw.replace(/[^0-9.-]+/g, ""));
        return isNaN(num) ? raw : num.toLocaleString("ru-RU");
    }, [selectedVariation?.price_html, product.price_html]);

    return (
        <div className={`store-product ${cartItem ? "selected" : ""}`}>
            {/* Кликабельная карточка товара */}
            <div
                onClick={handleCardClick}
                className="cursor-pointer"
                role="button"
                aria-label={`Просмотр товара ${product.name}`}
            >
                <Image
                    src={imageSrc}
                    alt={imageAlt}
                    width={300}
                    height={300}
                    className="w-full h-auto object-cover rounded-2xl"
                    loading="lazy"
                    unoptimized
                />
                <div className="store-product-label mt-3">
                    <span className="store-product-title block text-base font-bold text-white">
                        {product.name}
                    </span>
                    <span className="store-product-price block text-2xl font-black text-[#00e6cc] mt-2">
                        {formattedPrice} ₽
                    </span>
                </div>
            </div>

            {/* Кнопки выбора вариации (размер, жёсткость и т.д.) */}
            {product.type === "variable" && product.variations && product.variations.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3 justify-center">
                    {product.variations.map((variation) => {
                        const isSelected = selectedVariation?.id === variation.id;
                        const attrs = variation.attributes.map((a) => a.option).join(" × ");

                        return (
                            <button
                                key={variation.id}
                                onClick={() => setSelectedVariation(variation)}
                                className={`px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 ${
                                    isSelected
                                        ? "bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] shadow-lg"
                                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                                }`}
                            >
                                {attrs}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Счётчик количества */}
            {cartItem && cartItem.count > 0 && (
                <div className="store-product-counter text-2xl font-black text-[#00e6cc] mt-3 text-center">
                    {cartItem.count}
                </div>
            )}

            {/* Кнопки управления корзиной — крупные, по ширине */}
            <div className="store-product-buttons flex justify-between items-center mt-5 gap-4">
                {cartItem && cartItem.count > 0 ? (
                    <button
                        onClick={handleRemove}
                        className="w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center text-3xl font-bold hover:bg-red-700 transition-all shadow-lg"
                        aria-label="Уменьшить количество"
                    >
                        −
                    </button>
                ) : (
                    <div className="w-14 h-14" />
                )}

                <button
                    onClick={handleAdd}
                    className="flex-1 h-16 bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] rounded-3xl font-black text-xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300"
                    aria-label="Добавить в корзину"
                >
                    <span className="block">
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
        <div className="bg-gray-700 rounded-2xl w-full aspect-square" />
        <div className="mt-3 space-y-3">
            <div className="bg-gray-700 h-5 rounded w-4/5" />
            <div className="bg-gray-700 h-8 rounded w-3/5" />
        </div>
        <div className="mt-6 flex justify-end">
            <div className="bg-gray-700 h-16 w-full rounded-3xl" />
        </div>
    </div>
));

StoreItemSkeleton.displayName = "StoreItemSkeleton";

export default StoreItem;