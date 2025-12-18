import { NextRequest, NextResponse } from "next/server";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { z } from "zod";

export const runtime = "nodejs";

const woo = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
});

// важно: у тебя переменная называется TELEGRAM_CHAT_ID
async function notifyTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  }).catch(() => null);
}

const BodySchema = z.object({
  cart: z.array(
    z.object({
      product: z.object({
        id: z.number(),
        name: z.string().optional(),
        price: z.string().optional(),
      }),
      count: z.number().int().positive(),
    })
  ).min(1),
  customer: z.object({
    name: z.string().min(2),
    phone: z.string().min(6),
    address: z.string().min(5),
    comment: z.string().optional(),
  }),
  telegramData: z.any().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = BodySchema.parse(json);

    const [firstName, ...rest] = parsed.customer.name.trim().split(/\s+/);
    const lastName = rest.join(" ");

    const line_items = parsed.cart.map((i) => ({
      product_id: i.product.id,
      quantity: i.count,
    }));

    const orderPayload: any = {
      status: "processing",
      payment_method: "cod",
      payment_method_title: "Оплата при получении",
      set_paid: false,
      billing: {
        first_name: firstName || parsed.customer.name,
        last_name: lastName || "",
        phone: parsed.customer.phone,
        address_1: parsed.customer.address,
        country: "RU",
      },
      shipping: {
        first_name: firstName || parsed.customer.name,
        last_name: lastName || "",
        address_1: parsed.customer.address,
        country: "RU",
      },
      customer_note: parsed.customer.comment || "",
      line_items,
      meta_data: [
        { key: "tg_init", value: parsed.telegramData ?? null },
        { key: "tg_source", value: "telegram_mini_app" },
      ],
    };

    const { data: created } = await woo.post("orders", orderPayload);

    const cartText = parsed.cart
      .map((i) => `• ${i.product.name || `#${i.product.id}`} × ${i.count}`)
      .join("\n");

    await notifyTelegram(
      [
        `<b>Новый заказ #${created.id}</b>`,
        `Имя: <b>${parsed.customer.name}</b>`,
        `Тел: <b>${parsed.customer.phone}</b>`,
        `Адрес: ${parsed.customer.address}`,
        parsed.customer.comment ? `Комментарий: ${parsed.customer.comment}` : "",
        "",
        `<b>Позиции:</b>`,
        cartText,
        "",
        `Woo: ${process.env.WOOCOMMERCE_URL?.replace(/\/$/, "")}/wp-admin/post.php?post=${created.id}&action=edit`,
      ].filter(Boolean).join("\n")
    );

    return NextResponse.json({ ok: true, orderId: created.id });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
