import { NextRequest, NextResponse } from "next/server";
import woo from "@/lib/woo";
import { createInvoiceLink } from "@/lib/bot";
import telegramCurrencies from "@/lib/telegram-currencies";

// Валидация входных данных (zod — стандарт для Next.js API)
import { z } from "zod";

const OrderSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      count: z.number().int().positive(),
    })
  ),
  comment: z.string().optional(),
  shippingZone: z.number().int().positive().optional(),
});

type OrderPayload = z.infer<typeof OrderSchema>;

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();

    // Валидация тела запроса
    const payload = OrderSchema.parse(rawBody);

    // Создание заказа в WooCommerce
    const order = await woo.createOrder(
      payload.items.map((item) => ({
        product_id: item.id,
        quantity: item.count,
      })),
      payload.comment || ""
    );

    // Проверка валюты
    const telegramCurrency = telegramCurrencies[order.currency];
    if (!telegramCurrency) {
      return NextResponse.json(
        { error: "Unsupported currency for Telegram Payments" },
        { status: 400 }
      );
    }

    // Формирование цен для Telegram Invoice (в минимальных единицах)
    const prices = order.line_items.map((item) => ({
      label: `${item.name} × ${item.quantity}`,
      amount: Math.round(parseFloat(item.total) * Math.pow(10, telegramCurrency.exp)),
    }));

    // Генерация ссылки на оплату
    const invoiceLink = await createInvoiceLink(
      order.id,
      order.order_key,
      telegramCurrency.code,
      prices,
      payload.shippingZone
    );

    return NextResponse.json({ invoice_link: invoiceLink });
  } catch (error: any) {
    console.error("[/api/orders] Error:", error);

    // Обработка валидационных ошибок zod
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    // Общие ошибки (WooCommerce, Telegram и т.д.)
    return NextResponse.json(
      { error: "Failed to create order or invoice" },
      { status: 500 }
    );
  }
}

// Рекомендую явно указать Node.js runtime (standalone не любит Edge для внешних библиотек)
export const runtime = "nodejs";