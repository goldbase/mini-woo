// src/components/store-item.tsx
"use client";

import { Product, useAppContext } from "@/providers/context-provider";
import Image from "next/image";
import { memo, useCallback, useState, useEffect, useMemo } from "react";

interface StoreItemProps {
    product: Product;
}

const StoreItem = memo(({ product }: StoreItemProps) => {
    const { state, dispatch } = useAppContext();
    const cartItem = state.cart.get(product.id);

    const [selectedVariation, setSelectedVariation] = useState<any>(null);

    useEffect(() => {
        if (product.type === "variable" && product.variations && product.variations.length > 0) {
            setSelectedVariation(product.variations[0]);
        } else {
            setSelectedVariation(null);
        }
    }, [product.type, product.variations]);

    const itemToAdd = useMemo(() => {
        if (selectedVariation) {
            const attrs = selectedVariation.attributes.map((a: any) => a.option).join(" × ");
            return {
                ...product,
                id: selectedVariation.id,
                price_html: selectedVariation.price_html,
                images: selectedVariation.image ? [selectedVariation.image] : product.images,
                variationId: selectedVariation.id,
                selectedAttributes: attrs,
            };
        }
        return product;
    }, [product, selectedVariation]);

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
        dispatch({ type: "item", product });
    }, [dispatch, product]);

    const imageSrc = useMemo(() => {
        const img = itemToAdd.images?.[0];
        if (!img) return "/no-image.png";
        if ("thumbnail" in img && img.thumbnail) return img.thumbnail;
        return img.src || "/no-image.png";
    }, [itemToAdd.images]);

    const imageAlt = itemToAdd.images?.[0]?.alt || product.name || "Товар";

    // Безопасное форматирование цены (критично — убирает краш)
    const formattedPrice = useMemo(() => {
        const raw = itemToAdd.price_html || "";
        const clean = raw.replace(/<[^>]*>/g, "").trim();
        if (clean === "") return "Цена по запросу";

        const num = Number(clean.replace(/[^0-9.-]+/g, ""));
        return isNaN(num) ? clean : num.toLocaleString("ru-RU");
    }, [itemToAdd.price_html]);

    return (
        <div className={`store-product ${cartItem ? "selected" : ""}`}>
            <div onClick={handleCardClick} className="cursor-pointer" role="button">
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
                        {"selectedAttributes" in itemToAdd && itemToAdd.selectedAttributes && (
                            <span className="block text-sm text-[#00e6cc] mt-1">
                                {itemToAdd.selectedAttributes}
                            </span>
                        )}
                    </span>
                    <span className="store-product-price block text-2xl font-black text-[#00e6cc] mt-2">
                        {formattedPrice} ₽
                    </span>
                </div>
            </div>

            {product.type === "variable" && product.variations && product.variations.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3 justify-center">
                    {product.variations.map((variation: any) => {
                        const isSelected = selectedVariation?.id === variation.id;
                        const attrs = variation.attributes.map((a: any) => a.option).join(" × ");

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

            {cartItem && cartItem.count > 0 && (
                <div className="store-product-counter text-2xl font-black text-[#00e6cc] mt-3 text-center">
                    {cartItem.count}
                </div>
            )}

            <div className="store-product-buttons flex justify-between items-center mt-5 gap-4">
                {cartItem && cartItem.count > 0 ? (
                    <button
                        onClick={handleRemove}
                        className="w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center text-3xl font-bold hover:bg-red-700 transition-all shadow-lg"
                    >
                        −
                    </button>
                ) : (
                    <div className="w-14 h-14" />
                )}

                <button
                    onClick={handleAdd}
                    className="flex-1 h-16 bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] rounded-3xl font-black text-xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300"
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