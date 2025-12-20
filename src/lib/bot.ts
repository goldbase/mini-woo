import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { LabeledPrice } from "@telegraf/types";
import woo from "@/lib/woo";

export const SECRET_HASH = process.env.TELEGRAM_BOT_SECRET!!;

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  `https://${process.env.NEXT_PUBLIC_VERCEL_URL!!}`;

const WEBHOOK_URL = `${BASE_PATH}/api/telegram-hook?secret_hash=${SECRET_HASH}`;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!!;

const bot = new Telegraf(BOT_TOKEN);

/** =========================
 *  SUPPORT SETTINGS
 *  ========================= */
function parseManagerIds(): number[] {
  const raw =
    process.env.TELEGRAM_SUPPORT_MANAGER_IDS ||
    process.env.TELEGRAM_MANAGER_CHAT_ID ||
    "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

const SUPPORT_MANAGERS = parseManagerIds();

/**
 * Простая in-memory маршрутизация:
 * - ticketByUser: пользователь -> ticketId
 * - ticketToUser: ticketId -> userId
 * - managerReplyMode: managerId -> userId (кому сейчас отвечает)
 *
 * ВАЖНО: это живёт в памяти процесса. После рестарта — сбросится.
 * Для MVP норм. Если хочешь “железно” — вынесем в Redis/DB.
 */
let ticketSeq = 1000;
const ticketByUser = new Map<number, number>();
const ticketToUser = new Map<number, number>();
const managerReplyMode = new Map<number, number>();

function makeUserLabel(ctx: any) {
  const u = ctx.from;
  const full = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  const username = u?.username ? `@${u.username}` : "";
  return `${full || "Пользователь"} ${username}`.trim();
}

function supportStartText() {
  return (
    "🆘 *Поддержка ErgoSpine*\n\n" +
    "Напишите сюда свой вопрос — и менеджер ответит вам в этом чате.\n\n" +
    "Чтобы мы помогли быстрее, отправьте, пожалуйста:\n" +
    "1) что хотите подобрать (матрас / подушку)\n" +
    "2) рост/вес, поза сна\n" +
    "3) есть ли боли (шея/поясница)\n" +
    "4) город доставки\n\n" +
    "📎 Можно прикреплять фото/скрины.\n" +
    "⏱ Обычно отвечаем быстро."
  );
}

function storeStartText() {
  return "Добро пожаловать в ErgoSpine 👋\nВыберите действие:";
}

function storeKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.webApp("🛍️ Каталог", BASE_PATH),
    Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN"),
  ]);
}

function supportKeyboard() {
  return Markup.inlineKeyboard([
    Markup.button.callback("✍️ Написать в поддержку", "SUPPORT_OPEN"),
    Markup.button.webApp("🛍️ Открыть каталог", BASE_PATH),
  ]);
}

/** =========================
 *  START / MENU
 *  ========================= */
bot.start(async (ctx) => {
  const payload = (ctx.startPayload || "").trim();

  if (payload === "support") {
    await ctx.reply(supportStartText(), { parse_mode: "Markdown", ...supportKeyboard() });
    return;
  }

  await ctx.reply(storeStartText(), storeKeyboard());
});

bot.action("SUPPORT_OPEN", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(supportStartText(), { parse_mode: "Markdown" });
});

bot.help((ctx) => ctx.reply("Напишите /start чтобы открыть меню."));

bot.command("menu", (ctx) =>
  ctx.setChatMenuButton({
    text: "Каталог",
    type: "web_app",
    web_app: { url: BASE_PATH },
  })
);

/** =========================
 *  SUPPORT: create ticket on any user message
 *  ========================= */
async function sendToManagers(text: string, extra?: any) {
  if (!SUPPORT_MANAGERS.length) return;

  for (const mid of SUPPORT_MANAGERS) {
    try {
      await bot.telegram.sendMessage(mid, text, extra);
    } catch (e) {
      // не падаем
      console.log("Support manager send error:", mid, e);
    }
  }
}

function ensureTicket(userId: number): number {
  let tid = ticketByUser.get(userId);
  if (!tid) {
    tid = ++ticketSeq;
    ticketByUser.set(userId, tid);
    ticketToUser.set(tid, userId);
  }
  return tid;
}

function managerTicketKeyboard(ticketId: number) {
  return Markup.inlineKeyboard([
    Markup.button.callback("💬 Ответить", `SUPPORT_REPLY:${ticketId}`),
    Markup.button.callback("✅ Закрыть", `SUPPORT_CLOSE:${ticketId}`),
  ]);
}

bot.action(/^SUPPORT_REPLY:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const managerId = ctx.from?.id;
  const ticketId = Number((ctx.match as any)[1]);
  const userId = ticketToUser.get(ticketId);

  if (!managerId || !userId) {
    await ctx.reply("Не могу найти пользователя этого тикета.");
    return;
  }

  managerReplyMode.set(managerId, userId);

  await ctx.reply(
    `✍️ Режим ответа включён.\nСледующее ваше сообщение уйдёт клиенту (тикет #${ticketId}).\n\nЧтобы отменить — нажмите «Закрыть» или отправьте /cancel`,
    Markup.inlineKeyboard([Markup.button.callback("✅ Закрыть", `SUPPORT_CLOSE:${ticketId}`)])
  );
});

bot.action(/^SUPPORT_CLOSE:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const managerId = ctx.from?.id;
  const ticketId = Number((ctx.match as any)[1]);

  const userId = ticketToUser.get(ticketId);
  if (userId) {
    // закрываем тикет (по желанию можно оставить историю)
    ticketToUser.delete(ticketId);
    ticketByUser.delete(userId);
  }
  if (managerId) managerReplyMode.delete(managerId);

  await ctx.reply(`✅ Тикет #${ticketId} закрыт.`);
});

bot.command("cancel", async (ctx) => {
  const managerId = ctx.from?.id;
  if (managerId && managerReplyMode.has(managerId)) {
    managerReplyMode.delete(managerId);
    await ctx.reply("Ок, режим ответа отключён.");
    return;
  }
  await ctx.reply("Нечего отменять 🙂");
});

/**
 * Сообщения:
 * - если пишет менеджер и он в replyMode -> отправляем клиенту
 * - если пишет обычный пользователь -> создаём тикет и шлём менеджерам
 */
bot.on(message("text"), async (ctx) => {
  const chatType = ctx.chat?.type;
  const fromId = ctx.from?.id;

  if (!fromId) return;

  // Менеджер отвечает клиенту
  if (SUPPORT_MANAGERS.includes(fromId) && managerReplyMode.has(fromId)) {
    const userId = managerReplyMode.get(fromId)!;
    const text = ctx.message.text;

    try {
      await bot.telegram.sendMessage(
        userId,
        `💬 *Ответ поддержки*\n\n${text}`,
        { parse_mode: "Markdown" }
      );
      await ctx.reply("✅ Отправлено клиенту.");
    } catch (e) {
      await ctx.reply("❌ Не удалось отправить клиенту. Возможно, клиент не писал боту или заблокировал его.");
    }
    return;
  }

  // Игнорируем сообщения не из private (на всякий)
  if (chatType !== "private") return;

  // Обычный пользователь -> тикет
  const ticketId = ensureTicket(fromId);
  const userLabel = makeUserLabel(ctx);
  const text = ctx.message.text;

  const msg =
    `🆘 *Новый запрос поддержки*\n` +
    `Тикет: #${ticketId}\n` +
    `Клиент: ${userLabel}\n` +
    `ID: \`${fromId}\`\n\n` +
    `Сообщение:\n${text}`;

  await sendToManagers(msg, { parse_mode: "Markdown", ...managerTicketKeyboard(ticketId) });

  await ctx.reply(
    "✅ Принято! Менеджер уже получил ваш запрос.\nЕсли нужно — добавьте детали (город, рост/вес, поза сна)."
  );
});

/** =========================
 *  EXISTING: shipping/payment
 *  ========================= */
bot.on("shipping_query", async (ctx) => {
  const payload = JSON.parse(ctx.update.shipping_query.invoice_payload);
  const shippingOptions = await woo.getShippingOptions(payload.shippingZone);
  if (shippingOptions.length) ctx.answerShippingQuery(true, shippingOptions, undefined);
  else ctx.answerShippingQuery(false, undefined, "No shipping option available at your zone!");
});

bot.on("pre_checkout_query", async (ctx) => {
  const payload = JSON.parse(ctx.update.pre_checkout_query.invoice_payload);
  const orderInfo = ctx.update.pre_checkout_query.order_info!!;
  const res = await woo.updateOrderInfo(payload.orderId, orderInfo);
  if (res.status === 200) await ctx.answerPreCheckoutQuery(true);
  else await ctx.answerPreCheckoutQuery(false, "Problem occurred during update order, contact support!");
});

bot.on(message("successful_payment"), async (ctx) => {
  const payload = JSON.parse(ctx.update.message.successful_payment.invoice_payload);
  const res = await woo.setOrderPaid(payload.orderId);
  if (res.status === 200) {
    ctx.reply("Order successfully registered!");
  } else {
    ctx.reply(
      `Error registering payment, contact support!\norderId:${payload.orderId}\n${ctx.update.message.successful_payment.telegram_payment_charge_id}\n${ctx.update.message.successful_payment.provider_payment_charge_id}`
    );
  }
});

export function initWebhook() {
  return bot.telegram.setWebhook(WEBHOOK_URL);
}

export async function createInvoiceLink(
  orderId: number,
  orderKey: string,
  currency: string,
  prices: LabeledPrice[],
  shippingZone: number
) {
  const telegramInvoice = {
    provider_token: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN!!,
    title: `Order Invoice ${orderId}`,
    description: `Payment invoice for ${orderKey}`,
    currency,
    photo_url: undefined,
    is_flexible: false,
    prices,
    payload: JSON.stringify({ orderId, shippingZone }),
    need_name: true,
    need_email: true,
    need_phone_number: true,
    need_shipping_address: true,
  };

  return await bot.telegram.createInvoiceLink(telegramInvoice);
}

export default bot;
