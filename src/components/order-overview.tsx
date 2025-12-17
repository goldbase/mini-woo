// src/components/order-overview.tsx
"use client";

import { useAppContext } from "@/providers/context-provider";
import { memo } from "react";

const OrderOverview = memo(() => {
    const { state, dispatch } = useAppContext();

    // Итоговая сумма (с учётом количества и вариации)
    const total = state.cart.reduce((sum, item) => {
        const raw = item.product.price_html || "";
        const clean = raw.replace(/<[^>]*>/g, "").trim();
        const price = Number(clean.replace(/[^0-9.-]+/g, "")) || 0;
        return sum + price * item.count;
    }, 0);

    const formattedTotal = total.toLocaleString("ru-RU");

    const handleCheckout = () => {
        dispatch({ type: "order" });
    };

    if (state.cart.size === 0) {
        return (
            <section className="order-overview px-6 py-8 text-center">
                <p className="text-xl text-gray-400">Корзина пуста</p>
            </section>
        );
    }

    return (
        <section className="order-overview px-6 py-8 bg-gray-900/50 backdrop-blur-lg rounded-3xl mx-4 mt-6">
            <div className="order-header-wrap mb-6">
                <h2 className="order-header text-3xl font-black text-white">Ваш заказ</h2>
                <span className="order-edit text-[#00e6cc] text-lg cursor-pointer" onClick={() => dispatch({ type: "storefront" })}>
                    Редактировать
                </span>
            </div>

            <div className="order-items space-y-4 mb-8">
                {Array.from(state.cart.values()).map((item) => {
                    const attrs = (item.product as any).selectedAttributes || "";
                    return (
                        <div key={item.product.id} className="flex justify-between items-center bg-gray-800/50 rounded-2xl p-4">
                            <div>
                                <p className="font-bold text-white">{item.product.name}</p>
                                {attrs && <p className="text-sm text-[#00e6cc]">{attrs}</p>}
                                <p className="text-sm text-gray-400">Количество: {item.count}</p>
                            </div>
                            <p className="text-xl font-bold text-[#00e6cc]">
                                {item.count} × { /* цена одного */ }
                                {(() => {
                                    const raw = item.product.price_html || "";
                                    const clean = raw.replace(/<[^>]*>/g, "").trim();
                                    const num = Number(clean.replace(/[^0-9.-]+/g, "")) || 0;
                                    return num.toLocaleString("ru-RU");
                                })()} ₽
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

            <div className="order-text-field-wrap mt-8">
                <textarea
                    className="order-text-field w-full bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-4 text-white placeholder-gray-500"
                    rows={3}
                    placeholder="Комментарий к заказу (размер, адрес, пожелания)…"
                    value={state.comment || ""}
                    onChange={(e) => dispatch({ type: "comment", comment: e.target.value })}
                />
            </div>
        </section>
    );
});

OrderOverview.displayName = "OrderOverview";

export default OrderOverview;