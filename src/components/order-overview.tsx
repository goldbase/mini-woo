"use client";

import { useAppContext } from "@/providers/context-provider";
import Image from "next/image";
import { memo, useMemo } from "react";

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

const OrderOverview = memo(() => {
  const { state, dispatch } = useAppContext();

  const items = useMemo(() => Array.from(state.cart.values()), [state.cart]);

  const total = useMemo(() => {
    return items.reduce((sum, item) => {
      const p =
        (item.product as any).sale_price && (item.product as any).sale_price !== "0"
          ? String((item.product as any).sale_price)
          : String(
              (item.product as any).price ||
                (item.product as any).regular_price ||
                (item.product as any).price_html ||
                ""
            );

      const num = parsePriceToNumber(p) ?? 0;
      return sum + num * item.count;
    }, 0);
  }, [items]);

  const formattedTotal = total.toLocaleString("ru-RU");

  const handleCheckout = () => {
    dispatch({ type: "order" });
  };

  if (state.cart.size === 0) {
    return (
      <section className="order-overview px-6 py-12 text-center">
        <p className="text-xl text-gray-400">Корзина пуста</p>
      </section>
    );
  }

  return (
    <section className="order-overview px-6 py-8 bg-gray-900/50 backdrop-blur-lg rounded-3xl mx-4 mt-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-black text-white">Ваш заказ</h2>
        <span
          className="text-[#00e6cc] text-lg cursor-pointer hover:underline"
          onClick={() => dispatch({ type: "storefront" })}
        >
          Редактировать
        </span>
      </div>

      <div className="space-y-4 mb-8">
        {items.map((item) => {
          const attrs = (item.product as any).selectedAttributes || "";

          // цена строки
          const raw =
            ((item.product as any).sale_price && (item.product as any).sale_price !== "0"
              ? String((item.product as any).sale_price)
              : "") ||
            String(
              (item.product as any).price ||
                (item.product as any).regular_price ||
                (item.product as any).price_html ||
                ""
            );

          const formattedPrice = formatRub(parsePriceToNumber(raw));

          // превью (жёсткий размер, чтобы карточки не "раздувало")
          const img = (item.product as any).images?.[0];
          const src = img?.src || "/no-image.png";
          const alt = img?.alt || item.product.name || "Товар";

          return (
            <div
              key={item.product.id}
              className="flex gap-4 items-center bg-gray-800/50 rounded-2xl p-4"
            >
              {/* PREVIEW */}
              <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden bg-white/5 flex-shrink-0">
                <Image
                  src={src}
                  alt={alt}
                  width={144}
                  height={144}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  unoptimized
                />
              </div>

              {/* INFO */}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-white truncate">{item.product.name}</p>
                {attrs && <p className="text-sm text-[#00e6cc] truncate">{attrs}</p>}
                <p className="text-sm text-gray-400">Количество: {item.count}</p>
              </div>

              {/* PRICE */}
              <p className="text-xl font-bold text-[#00e6cc] whitespace-nowrap">
                {formattedPrice}
              </p>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-700 pt-6">
        <div className="flex justify-between items-center mb-8">
          <p className="text-2xl font-bold text-white">Итого:</p>
          <p className="text-3xl font-black text-[#00e6cc]">{formattedTotal} ₽</p>
        </div>

        <button
          onClick={handleCheckout}
          className="w-full h-16 bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] rounded-3xl font-black text-2xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300"
        >
          Оформить заказ
        </button>
      </div>

      <div className="mt-8">
        <textarea
          className="w-full bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-4 text-white placeholder-gray-500 resize-none"
          rows={3}
          placeholder="Комментарий к заказу (адрес, пожелания)…"
          value={state.comment || ""}
          onChange={(e) => dispatch({ type: "comment", comment: e.target.value })}
        />
      </div>
    </section>
  );
});

OrderOverview.displayName = "OrderOverview";
export default OrderOverview;

