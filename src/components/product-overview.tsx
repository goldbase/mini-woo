"use client";

import "@/styles/product-overview.css";

import { useAppContext, Product } from "@/providers/context-provider";
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

function parsePriceToNumber(rawHtmlOrText: string): number | null {
  if (!rawHtmlOrText) return null;
  let raw = rawHtmlOrText.replace(/<[^>]*>/g, " ").trim();
  const match = raw.match(/(\d[\d\s.,]*)/);
  if (!match) return null;
  const cleaned = match[1].replace(/\s/g, "").replace(/,/g, ".");
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatRub(value: number | null): string {
  if (value === null) return "Цена по запросу";
  return `${value.toLocaleString("ru-RU")} ₽`;
}

const ProductOverview = memo(() => {
  const { state, dispatch } = useAppContext();
  const product = state.selectedProduct;

  const [selectedVariation, setSelectedVariation] = useState<AnyVariation | null>(null);

  useEffect(() => {
    if (!product) return;
    if (product.type === "variable" && product.variations && product.variations.length > 0) {
      setSelectedVariation(product.variations[0] as any);
    } else {
      setSelectedVariation(null);
    }
  }, [product]);

  const selectedAttrs = useMemo(() => {
    if (!selectedVariation?.attributes?.length) return "";
    return selectedVariation.attributes.map((a) => a.option).join(" × ");
  }, [selectedVariation]);

  const itemForCart = useMemo(() => {
    if (!product) return null;

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

  const cartItem = useMemo(() => {
    if (!product) return null;
    // корзина у тебя keyed по product.id (как на главном)
    return state.cart.get(product.id) || null;
  }, [state.cart, product]);

  const showVariations = !!product && product.type === "variable" && product.variations && product.variations.length > 0;

  const priceText = useMemo(() => {
    if (!itemForCart) return "";

    const raw =
      (itemForCart.sale_price && itemForCart.sale_price !== "0" ? itemForCart.sale_price : "") ||
      itemForCart.price ||
      itemForCart.regular_price ||
      itemForCart.price_html ||
      "";

    const num = parsePriceToNumber(raw);
    return formatRub(num);
  }, [itemForCart]);

  const images = useMemo(() => {
    if (!itemForCart?.images?.length) return [{ src: "/no-image.png", alt: "Нет фото" }];
    return itemForCart.images;
  }, [itemForCart]);

  const handleBack = useCallback(() => {
    dispatch({ type: "storefront" });
  }, [dispatch]);

  const handleAdd = useCallback(() => {
    if (!itemForCart) return;
    dispatch({ type: "inc", product: itemForCart });

    if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
      (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("light");
    }
  }, [dispatch, itemForCart]);

  const handleRemove = useCallback(() => {
    if (!itemForCart) return;
    dispatch({ type: "dec", product: itemForCart });

    if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
      (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("medium");
    }
  }, [dispatch, itemForCart]);

  if (!product || !itemForCart) return null;

  return (
    <section className="product-overview">
      <div className="product-photos">
        {images.map((img: any, idx: number) => {
          const src = img?.src || "/no-image.png";
          const alt = img?.alt || product.name || "Товар";

          // cache-busting: если заменил картинку на том же URL
          const v =
            (product as any).date_modified ||
            img?.id ||
            (selectedVariation?.id ? `var${selectedVariation.id}` : `p${product.id}`);

          const finalSrc = `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(v))}`;

          return (
            <div key={`${src}-${idx}`} className="product-photo">
              <Image
                src={finalSrc}
                alt={alt}
                width={900}
                height={900}
                unoptimized
                className="w-full h-auto"
                loading={idx === 0 ? "eager" : "lazy"}
              />
            </div>
          );
        })}
      </div>

      <div className="product-label">
        <span className="product-title">
          {product.name}
          {(itemForCart as any).selectedAttributes && (
            <span style={{ display: "block", marginTop: 6, color: "#00e6cc", fontWeight: 700, fontSize: 14 }}>
              {(itemForCart as any).selectedAttributes}
            </span>
          )}
        </span>

        <span className="product-price">{priceText}</span>

        {cartItem && cartItem.count > 0 && (
          <div className={`product-counter ${cartItem ? "selected" : ""}`}>{cartItem.count}</div>
        )}
      </div>

      {showVariations && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
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

      <div style={{ padding: "0 12px 18px", display: "flex", gap: 12, alignItems: "center" }}>
        {cartItem && cartItem.count > 0 ? (
          <button
            onClick={handleRemove}
            className="w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center text-3xl font-bold hover:bg-red-700 transition-all shadow-lg"
            aria-label="Уменьшить"
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

      <div
        className="product-description"
        // Woo description html:
        dangerouslySetInnerHTML={{
          __html: (product as any).description || (product as any).short_description || "",
        }}
      />

      <div style={{ padding: "0 12px 28px" }}>
        <button onClick={handleBack} className="w-full mt-2 text-[#00e6cc] text-center hover:underline">
          ← Назад в каталог
        </button>
      </div>
    </section>
  );
});

ProductOverview.displayName = "ProductOverview";
export default ProductOverview;
