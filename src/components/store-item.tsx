// src/components/store-item.tsx
"use client";

import { Product, useAppContext } from "@/providers/context-provider";
import Image from "next/image";
import { memo, useCallback, useState, useEffect } from "react";

interface StoreItemProps {
    product: Product;
}

const StoreItem = memo(({ product }: StoreItemProps) => {
    const { state, dispatch } = useAppContext();
    const cartItem = state.cart.get(product.id);

    // Состояние выбранной вариации
    const [selectedVariation, setSelectedVariation] = useState<any>(null);

    // При загрузке товара выбираем первую вариацию по умолчанию (если есть)
    useEffect(() => {
        if (product.type === "variable" && product.variations?.length > 0) {
            setSelectedVariation(product.variations[0]);
        } else {
            setSelectedVariation(null);
        }
    }, [product]);

    const itemToAdd = selectedVariation || product;

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

    const imageSrc = itemToAdd.images[0]?.src || "/no-image.png";
    const imageAlt = itemToAdd.images[0]?.alt || itemToAdd.name;

    // Цена выбранной вариации
    const rawPrice = (selectedVariation?.price_html || product.price_html || "").replace(/<[^>]*>/g, "").trim();
    const formattedPrice = Number(rawPrice.replace(/[^0-9.-]+/g, "")).toLocaleString("ru-RU");

    return (
        <div className={`store-product ${cartItem ? "selected" : ""}`}>
            <div onClick={handleCardClick} className="cursor-pointer" role="button">
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
                    <span className="store-product-title block text-sm font-medium">{product.name}</span>
                    <span className="store-product-price block text-lg font-bold">
                        {formattedPrice} ₽
                    </span>
                </div>
            </div>

            {/* Выбор вариации — только для variable */}
            {product.type === "variable" && product.variations?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {product.variations.map((variation: any) => {
                        const isSelected = selectedVariation?.id === variation.id;
                        const attributes = variation.attributes.map((a: any) => a.option).join(" / ");

                        return (
                            <button
                                key={variation.id}
                                onClick={() => setSelectedVariation(variation)}
                                className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                                    isSelected
                                        ? "bg-[var(--accent-color)] text-white"
                                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                }`}
                            >
                                {attributes}
                            </button>
                        );
                    })}
                </div>
            )}

            {cartItem && cartItem.count > 0 && (
                <div className="store-product-counter font-bold text-lg mt-2">{cartItem.count}</div>
            )}

            <div className="store-product-buttons flex justify-between mt-3">
                {cartItem && cartItem.count > 0 ? (
                    <button
                        onClick={handleRemove}
                        className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center text-xl hover:bg-red-600"
                    >
                        −
                    </button>
                ) : (
                    <div className="w-10 h-10" />
                )}

                <button
                    onClick={handleAdd}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                >
                    <span>{cartItem ? "Ещё" : "В корзину"}</span>
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