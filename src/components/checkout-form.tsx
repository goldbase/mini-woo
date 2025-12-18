"use client";

import { useAppContext } from "@/providers/context-provider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { memo } from "react";

const schema = z.object({
  name: z.string().min(2, "Имя слишком короткое"),
  phone: z.string().regex(/^[\d\s+()-]+$/, "Некорректный телефон").min(10, "Введите полный номер"),
  address: z.string().min(5, "Адрес слишком короткий"),
});

type FormData = z.infer<typeof schema>;

const CheckoutForm = memo(() => {
  const { state, dispatch } = useAppContext();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      address: state.comment || "",
    },
  });

  const onSubmit = async (data: FormData) => {
    if ((globalThis as any).Telegram?.WebApp?.HapticFeedback) {
      (globalThis as any).Telegram.WebApp.HapticFeedback.impactOccurred("heavy");
    }

    const orderData = {
      cart: Array.from(state.cart.values()),
      customer: {
        name: data.name,
        phone: data.phone,
        address: data.address,
        comment: state.comment || "",
      },
      telegramData: (globalThis as any).Telegram?.WebApp?.initDataUnsafe,
    };

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    if (res.ok) {
      const result = await res.json();
      dispatch({ type: "success" });
      (globalThis as any).Telegram.WebApp.HapticFeedback.notificationOccurred("success");
      (globalThis as any).Telegram.WebApp.close(); // или показать успех
    } else {
      (globalThis as any).Telegram.WebApp.HapticFeedback.notificationOccurred("error");
      alert("Ошибка оформления. Попробуйте позже.");
    }
  };

  const total = Array.from(state.cart.values()).reduce((sum, item) => {
    const price = Number(item.product.price_html.replace(/<[^>]*>/g, "").replace(/[^0-9.-]+/g, "")) || 0;
    return sum + price * item.count;
  }, 0);

  return (
    <section className="px-6 py-8">
      <h2 className="text-3xl font-black text-white mb-8">Оформление заказа</h2>

      <div className="bg-gray-900/50 backdrop-blur-lg rounded-3xl p-6 mb-8">
        <p className="text-2xl font-bold text-white">Итого: <span className="text-3xl text-[#00e6cc]">{total.toLocaleString("ru-RU")} ₽</span></p>
        <p className="text-gray-400 mt-2">Товаров: {state.cart.size}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <input
            {...register("name")}
            placeholder="Ваше имя *"
            className="w-full bg-gray-800/50 border border-gray-700 rounded-2xl p-4 text-white placeholder-gray-500"
          />
          {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <input
            {...register("phone")}
            placeholder="Телефон *"
            className="w-full bg-gray-800/50 border border-gray-700 rounded-2xl p-4 text-white placeholder-gray-500"
          />
          {errors.phone && <p className="text-red-400 text-sm mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <textarea
            {...register("address")}
            rows={3}
            placeholder="Адрес доставки * (или комментарий)"
            className="w-full bg-gray-800/50 border border-gray-700 rounded-2xl p-4 text-white placeholder-gray-500 resize-none"
          />
          {errors.address && <p className="text-red-400 text-sm mt-1">{errors.address.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-16 bg-gradient-to-r from-[#00d0b8] to-[#00e6cc] text-[#0b182f] rounded-3xl font-black text-2xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all disabled:opacity-70"
        >
          {isSubmitting ? "Отправка..." : "Оформить заказ"}
        </button>
      </form>

      <button
        onClick={() => dispatch({ type: "order" })}
        className="w-full mt-6 text-[#00e6cc] text-center hover:underline"
      >
        ← Назад в корзину
      </button>
    </section>
  );
});

CheckoutForm.displayName = "CheckoutForm";

export default CheckoutForm;