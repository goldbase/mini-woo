"use client";

import { useAppContext, Product } from "@/providers/context-provider";
import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import "@/styles/product-overview.css";

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
  const raw = rawHtmlOrText.replace(/<[^>]*>/g, " ").trim();
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
  const product = state.selectedProduct ?? null;

  const [selectedVariation, setSelectedVariation] = useState<AnyVariation | null>(null);

  useEffect(() => {
    if (!product) return;

    if (product.type === "variable" && product.variations?.length) {
      setSelectedVariation(product.variations[0] as any);
    } else {
      setSelectedVariation(null);
    }
  }, [product]);

  const selectedAttrsLabel = useMemo(() => {
    if (!selectedVariation?.attributes?.length) return "";
    return selectedVariation.attributes.map((a) => a.option).join(" × ");
  }, [selectedVariation]);

  const resolvedProduct = useMemo(() => {
    if (!product) return null;

    if (selectedVariation) {
      const v = selectedVariation;

      const images =
        v.image?.src
          ? [{ src: v.image.src, alt: v.image.alt, id: (v.image as any).id }]
          : product.images;

      return {
        ...product,
        variationId: v.id,
        price: v.price ?? product.price,
        regular_price: v.regular_price ?? product.regular_price,
        sale_price: v.sale_price ?? product.sale_price,
        price_html: v.price_html ?? product.price_html,
        images,
        selectedAttributes: selectedAttrsLabel,
      } as any;
    }

    return product as any;
  }, [product, selectedVariation, selectedAttrsLabel]);

  const formattedPrice = useMemo(() => {
    if (!resolvedProduct) return "";

    const raw =
      (resolvedProduct.sale_price && resolvedProduct.sale_price !== "0" ? resolvedProduct.sale_price : "") ||
      resolvedProduct.price ||
      resolvedProduct.regular_price ||
      resolvedProduct.price_html ||
      "";

    return formatRub(parsePriceToNumber(raw));
  }, [resolvedProduct]);

  const showVariations =
    !!product && product.type === "variable" && Array.isArray(product.variations) && product.variations.length > 0;

  const cartKey = useMemo(() => {
    // ВАЖНО: если у тебя cart map ключуется по product.id — оставляем.
    // variationId хранится внутри объекта product (resolvedProduct.variationId)
    return product?.id ?? 0;
  }, [product?.id]);

  const cartItem = state.cart.get(cartKey);

  const images = useMemo(() => {
    if (!resolvedProduct) return [];
    return resolvedProduct.images || [];
  }, [resolvedProduct]);

  const addToCart = useCallback(() => {
    if (!resolvedProduct || !product) return;
    dispatch({ type: "inc", product: resolvedProduct });

    const tg = (globalThis as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
  }, [dispatch, resolvedProduct, product]);

  const removeFromCart = useCallback(() => {
    if (!resolvedProduct || !product) return;
    dispatch({ type: "dec", product: resolvedProduct });

    const tg = (globalThis as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
  }, [dispatch, resolvedProduct, product]);

  const goBack = useCallback(() => {
    dispatch({ type: "storefront" });
  }, [dispatch]);

  if (!product || !resolvedProduct) return null;

  return (
    <section className="product-overview">
      <div className="product-photos">
        {(images.length ? images : [{ src: "/no-image.png", alt: "Нет изображения" }]).map((img: any, idx: number) => {
          const src = img?.src || "/no-image.png";
          const alt = img?.alt || product.name || "Товар";

          // cache-busting, если WP отдаёт тот же URL (часто так и бывает)
          const v = img?.id ?? (selectedVariation?.id ? `var${selectedVariation.id}` : `p${product.id}`);

          const finalSrc = `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(v))}`;

          return (
            <div className="product-photo" key={`${finalSrc}-${idx}`}>
              <Image
                src={finalSrc}
                alt={alt}
                width={900}
                height={900}
                className="w-full h-auto"
                priority={idx === 0}
                unoptimized
              />
            </div>
          );
        })}
      </div>

      <div className="product-label">
        <span className="product-title">
          {product.name}
          {resolvedProduct.selectedAttributes ? (
            <span style={{ display: "block", marginTop: 6, color: "#00e6cc", fontSize: 13, fontWeight: 800 }}>
              {resolvedProduct.selectedAttributes}
            </span>
          ) : null}
        </span>

        <span className="product-price">{formattedPrice}</span>
      </div>

      {showVariations && (
        <div className="product-variations">
          {(product.variations as any[]).map((v: AnyVariation) => {
            const isActive = selectedVariation?.id === v.id;
            const label = v.attributes?.map((a) => a.option).join(" × ") || `Вариант #${v.id}`;

            return (
              <button
                key={v.id}
                type="button"
                className={`product-variation-btn ${isActive ? "is-active" : ""}`}
                onClick={() => setSelectedVariation(v)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ padding: "0px 12px 18px", display: "flex", gap: 12, alignItems: "center" }}>
        {cartItem && cartItem.count > 0 ? (
          <button
            type="button"
            onClick={removeFromCart}
            className="w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center text-3xl font-bold hover:bg-red-700 transition-all shadow-lg"
            aria-label="Уменьшить количество"
          >
            −
          </button>
        ) : (
          <div className="w-14 h-14" />
        )}

        <button
          type="button"
          onClick={addToCart}
          className="flex-1 h-16 bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] rounded-3xl font-black text-xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300"
        >
          <span className="block">{cartItem ? "Ещё" : "В корзину"}</span>
        </button>
      </div>

      {/* описание */}
      <div
        className="product-description"
        dangerouslySetInnerHTML={{ __html: product.description || product.short_description || "" }}
      />

      <div style={{ padding: "0px 12px 28px" }}>
        <button className="w-full mt-2 text-[#00e6cc] text-center hover:underline" onClick={goBack}>
          ← Назад в каталог
        </button>
      </div>
    </section>
  );
});

ProductOverview.displayName = "ProductOverview";
export default ProductOverview;
