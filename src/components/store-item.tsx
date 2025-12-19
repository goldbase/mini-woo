"use client";

import { Product, useAppContext } from "@/providers/context-provider";
import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

type AnyVariation = {
  id: number;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  price_html?: string;
  attributes?: Array<{ name: string; option: string }>;
  image?: { src: string; alt?: string; id?: number };
};

interface StoreItemProps {
  product: Product;
}

function parsePriceToNumber(rawHtmlOrText: string): number | null {
  if (!rawHtmlOrText) return null;

  // убираем html
  let raw = rawHtmlOrText.replace(/<[^>]*>/g, " ").trim();

  // берём первое число, допускаем пробелы/точки/запятые
  const match = raw.match(/(\d[\d\s.,]*)/);
  if (!match) return null;

  // чистим: убираем пробелы, запятую -> точка
  const cleaned = match[1].replace(/\s/g, "").replace(/,/g, ".");
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatRub(value: number | null): string {
  if (value === null) return "Цена по запросу";
  return `${value.toLocaleString("ru-RU")} ₽`;
}

const StoreItem = memo(({ product }: StoreItemProps) => {
  const { state, dispatch } = useAppContext();
  const cartItem = state.cart.get(product.id);

  const [selectedVariation, setSelectedVariation] = useState<AnyVariation | null>(null);

  useEffect(() => {
    if (product.type === "variable" && product.variations && product.variations.length > 0) {
      setSelectedVariation(product.variations[0] as any);
    } else {
      setSelectedVariation(null);
    }
  }, [product.type, product.variations]);

  const selectedAttrs = useMemo(() => {
    if (!selectedVariation?.attributes?.length) return "";
    return selectedVariation.attributes.map((a) => a.option).join(" × ");
  }, [selectedVariation]);

  // что именно кладём в корзину
  const itemToAdd = useMemo(() => {
    if (selectedVariation) {
      const v = selectedVariation;

      const images =
        v.image?.src
          ? [
              {
                src: v.image.src,
                alt: v.image.alt,
                id: (v.image as any).id,
              },
            ]
          : product.images;

      return {
        ...product,
        // важное: product.id оставляем как есть для key/cart map,
        // а variationId кладём отдельно
        variationId: v.id,
        price: v.price ?? product.price,
        regular_price: v.regular_price ?? product.regular_price,
        sale_price: v.sale_price ?? product.sale_price,
        price_html: v.price_html ?? product.price_html,
        images,
        selectedAttributes: selectedAttrs,
      } as any;
    }

    return product as any;
  }, [product, selectedVariation, selectedAttrs]);

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
    if (!img?.src) return "/no-image.png";

    // cache-busting: если меняешь картинку на том же URL — добавляем v=
    const v =
      (img as any).id ??
      (selectedVariation?.id ? `var${selectedVariation.id}` : `p${product.id}`);

    return `${img.src}${img.src.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(v))}`;
  }, [itemToAdd.images, selectedVariation?.id, product.id]);

  const imageAlt = (itemToAdd.images?.[0] as any)?.alt || product.name || "Товар";

  const formattedPrice = useMemo(() => {
    // приоритет: явные price поля, потом price_html
    const raw =
      (itemToAdd.sale_price && itemToAdd.sale_price !== "0" ? itemToAdd.sale_price : "") ||
      itemToAdd.price ||
      itemToAdd.regular_price ||
      itemToAdd.price_html ||
      "";

    const num = parsePriceToNumber(raw);
    return formatRub(num);
  }, [itemToAdd.sale_price, itemToAdd.price, itemToAdd.regular_price, itemToAdd.price_html]);

  const showVariations = product.type === "variable" && product.variations && product.variations.length > 0;

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
            {(itemToAdd as any).selectedAttributes && (
              <span className="block text-sm text-[#00e6cc] mt-1">
                {(itemToAdd as any).selectedAttributes}
              </span>
            )}
          </span>

          <span className="store-product-price block text-2xl font-black text-[#00e6cc] mt-2">
            {formattedPrice}
          </span>
        </div>
      </div>

      {showVariations && (
        <div className="mt-4 flex flex-wrap gap-3 justify-center">
          {(product.variations as any[]).map((variation: AnyVariation) => {
            const isSelected = selectedVariation?.id === variation.id;
            const attrs = variation.attributes?.map((a) => a.option).join(" × ") || `Вариант #${variation.id}`;

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
          <span className="block">{cartItem ? "Ещё" : "В корзину"}</span>
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
