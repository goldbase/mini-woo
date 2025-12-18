import { NextRequest, NextResponse } from "next/server";
import woo from "@/lib/woo";
import { createInvoiceLink } from "@/lib/bot";
import telegramCurrencies from "@/lib/telegram-currencies";
import { z } from "zod";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!; // число или @username

const OrderSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      count: z.number().int().positive(),
    })
  ),
  comment: z.string().optional(),
  shippingZone: z.number().int().positive().optional(),
  telegramData: z.object({ user: z.any().optional() }).optional(), // Telegram WebApp initDataUnsafe
});

type OrderPayload = z.infer<typeof OrderSchema>;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const payload = OrderSchema.parse(rawBody);

    const line_items = payload.items.map((item) => ({
      product_id: item.id,
      quantity: item.count,
    }));

    const order = await woo.createOrder(line_items, payload.comment || "");

    const currency = order.currency as keyof typeof telegramCurrencies;
    const telegramCurrency = telegramCurrencies[currency];

    if (!telegramCurrency) {
      return NextResponse.json(
        { error: "Unsupported currency for Telegram Payments" },
        { status: 400 }
      );
    }

    const prices = order.line_items.map((item: any) => ({
      label: `${item.name} × ${item.quantity}`,
      amount: Math.round(parseFloat(item.total) * Math.pow(10, telegramCurrency.exp)),
    }));

    const invoiceLink = await createInvoiceLink(
      order.id,
      order.order_key,
      telegramCurrency.code,
      prices,
      payload.shippingZone ?? 1  // Дефолтная зона доставки = 1, если не передана
    );

    // Уведомление менеджеру в Telegram
    const total = order.total;
    const text = `Новый заказ #${order.id}\n\n` +
      `Клиент: ${payload.telegramData?.user?.first_name || "Аноним"} (@${payload.telegramData?.user?.username || "—"})\n` +
      `Товары:\n${order.line_items.map((i: any) => `• ${i.name} × ${i.quantity}`).join("\n")}\n\n` +
      `Комментарий: ${payload.comment || "—"}\n` +
      `Итого: ${total} ${order.currency}\n\n` +
      `Ссылка на оплату: ${invoiceLink}`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    return NextResponse.json({ invoice_link: invoiceLink });
  } catch (error: any) {
    console.error("[/api/orders] Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create order or invoice" },
      { status: 500 }
    );
  }
}