import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { LabeledPrice } from "@telegraf/types";
import woo from "@/lib/woo";

/**
 * ENV
 */
export const SECRET_HASH = process.env.TELEGRAM_BOT_SECRET!!;

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  `https://${process.env.NEXT_PUBLIC_VERCEL_URL!!}`;

const WEBHOOK_URL = `${BASE_PATH}/api/telegram-hook?secret_hash=${SECRET_HASH}`;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!!;

const ORDERS_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // куда летят заказы (группа/канал)
const MANAGER_CHAT_ID = process.env.TELEGRAM_MANAGER_CHAT_ID; // личный чат менеджера (user id)

const bot = new Telegraf(BOT_TOKEN);

/**
 * Simple in-memory state:
 * managerReplyTo[managerId] = userId (кому отвечаем следующим сообщением)
 * blockedUsers = set(userId)
 *
 * ⚠️ При рестарте PM2 это очистится. Если нужно “навсегда” — сделаем хранение в файле/SQLite.
 */
const managerReplyTo = new Map<number, number>();
const blockedUsers = new Set<number>();

function supportWelcomeText() {
  return (
    "💬 **Поддержка ErgoSpine**\n\n" +
    "Напишите ваш вопрос одним сообщением — менеджер ответит прямо здесь.\n\n" +
    "✅ Чтобы ответ пришёл быстрее, укажите:\n" +
    "• модель товара (если есть)\n" +
    "• город / доставку\n" +
    "• рост / вес / пожелания по жёсткости (если вопрос про матрас)\n\n" +
    "📎 Можно отправлять фото, скриншоты и голосовые.\n" +
    "⏱️ Обычно отвечаем в течение 5–15 минут в рабочее время."
  );
}

function supportKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Открыть каталог", BASE_PATH)],
    [Markup.button.callback("🔁 Новый вопрос", "support_new")],
  ]);
}

function managerTicketKeyboard(userId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✍️ Ответить", `reply:${userId}`),
      Markup.button.callback("✅ Закрыть", `close:${userId}`),
    ],
    [Markup.button.callback("⛔️ Заблокировать", `block:${userId}`)],
  ]);
}

function safeUserTag(userId: number) {
  return `tg://user?id=${userId}`;
}

function isManager(ctx: any) {
  const fromId = ctx.from?.id;
  if (!fromId) return false;
  return MANAGER_CHAT_ID ? String(fromId) === String(MANAGER_CHAT_ID) : false;
}

/**
 * START
 * - /start support => режим поддержки
 * - /start => магазин
 */
bot.start(async (ctx) => {
  const text = ctx.message?.text || "";
  const payload = text.split(" ").slice(1).join(" ").trim();

  // Поддержка по deep-link
  if (payload === "support") {
    // убираем webapp menu (чтобы не путало пользователя)
    await ctx.setChatMenuButton({ type: "commands" });

    await ctx.replyWithMarkdown(supportWelcomeText(), supportKeyboard());
    return;
  }

  // Магазин (обычный старт)
  await ctx.setChatMenuButton({
    type: "web_app",
    text: "Каталог",
    web_app: { url: BASE_PATH },
  });

  await ctx.reply(
    "Добро пожаловать в ErgoSpine 👋",
    Markup.inlineKeyboard([
      [Markup.button.webApp("🛍️ Открыть каталог", BASE_PATH)],
      [Markup.button.url("💬 Поддержка", `https://t.me/${ctx.me}?start=support`)],
    ])
  );
});

bot.help(async (ctx) => {
  await ctx.reply("Нажмите /start чтобы открыть каталог или поддержку.");
});

bot.command("menu", async (ctx) => {
  await ctx.setChatMenuButton({
    text: "Каталог",
    type: "web_app",
    web_app: { url: BASE_PATH },
  });
  await ctx.reply("Кнопка «Каталог» включена ✅");
});

/**
 * Support: кнопка "Новый вопрос"
 */
bot.action("support_new", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
    "🆕 Отлично! Опишите ваш вопрос одним сообщением.\n\n" +
      "Например:\n" +
      "• «Хочу матрас, болит поясница, рост 178 вес 92, сплю на боку»\n" +
      "• «Как быстро доставите в Краснодар?»"
  );
});

/**
 * Forward user messages to manager (support)
 * - text/photos/voice/documents
 * - Only from private chats (DM to bot)
 */
bot.on(message(), async (ctx) => {
  // Не мешаем системным апдейтам и платежам
  // (successful_payment, pre_checkout_query etc. — отдельные handlers ниже)
  const chatType = ctx.chat?.type;
  if (chatType !== "private") return;

  const userId = ctx.from?.id;
  if (!userId) return;

  // Если юзер заблокирован — игнорим
  if (blockedUsers.has(userId)) return;

  // Если пишет менеджер — это обработаем отдельно ниже (режим ответа)
  if (isManager(ctx)) return;

  // Любое обычное сообщение пользователя в личке считаем обращением в поддержку
  if (!MANAGER_CHAT_ID) {
    await ctx.reply(
      "⚠️ Поддержка сейчас не настроена: не задан TELEGRAM_MANAGER_CHAT_ID."
    );
    return;
  }

  // Красивый “принято”
  await ctx.reply(
    "✅ Принято! Передал менеджеру. Он ответит здесь в этом чате.",
    Markup.inlineKeyboard([[Markup.button.webApp("🛍️ Каталог", BASE_PATH)]])
  );

  // Отправляем менеджеру с контекстом
  const userName =
    [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
    "Пользователь";

  const header =
    "📩 **Новое обращение в поддержку**\n" +
    `👤 ${userName}\n` +
    `🆔 ${userId}\n` +
    `🔗 ${safeUserTag(userId)}\n\n`;

  // 1) сначала шапку
  await bot.telegram.sendMessage(
    Number(MANAGER_CHAT_ID),
    header,
    { parse_mode: "Markdown", ...managerTicketKeyboard(userId) }
  );

  // 2) потом сам контент — пересылаем оригинал (так удобнее: фото/голос и т.д.)
  // forwardMessage сохраняет "кто отправил", но иногда приватность мешает.
  // Поэтому делаем copyMessage — надёжнее и без лишних ограничений.
  try {
    await bot.telegram.copyMessage(
      Number(MANAGER_CHAT_ID),
      ctx.chat.id,
      (ctx.message as any).message_id
    );
  } catch (e) {
    // fallback: если copyMessage не прошёл — хотя бы текстом
    const text = (ctx.message as any)?.text;
    if (text) {
      await bot.telegram.sendMessage(Number(MANAGER_CHAT_ID), `📝 ${text}`);
    }
  }
});

/**
 * Manager buttons: Reply / Close / Block
 */
bot.action(/^reply:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isManager(ctx)) {
    await ctx.reply("Недостаточно прав.");
    return;
  }

  const userId = Number(ctx.match[1]);
  managerReplyTo.set(Number(MANAGER_CHAT_ID), userId);

  await ctx.reply(
    `✍️ Режим ответа включён.\nСледующее ваше сообщение уйдёт пользователю: ${userId}\n\n` +
      "Напишите текст/отправьте фото/голос — всё уйдёт клиенту."
  );
});

bot.action(/^close:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isManager(ctx)) {
    await ctx.reply("Недостаточно прав.");
    return;
  }

  const userId = Number(ctx.match[1]);

  // Просто информируем менеджера, можно расширить логикой статусов
  await ctx.reply(`✅ Тикет закрыт (userId: ${userId}).`);
});

bot.action(/^block:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isManager(ctx)) {
    await ctx.reply("Недостаточно прав.");
    return;
  }

  const userId = Number(ctx.match[1]);
  blockedUsers.add(userId);

  await ctx.reply(`⛔️ Пользователь заблокирован (userId: ${userId}).`);
});

/**
 * Manager sends a message -> if in reply-mode, forward to user
 */
bot.on(message(), async (ctx) => {
  const chatType = ctx.chat?.type;
  if (chatType !== "private") return;

  if (!isManager(ctx)) return;

  const managerId = Number(MANAGER_CHAT_ID);
  const userId = managerReplyTo.get(managerId);

  // менеджер не в режиме ответа — не трогаем
  if (!userId) return;

  try {
    await bot.telegram.copyMessage(userId, ctx.chat.id, (ctx.message as any).message_id);
    await ctx.reply("✅ Отправлено клиенту.");

    // выключаем режим ответа после одного сообщения (как ты и хотел)
    managerReplyTo.delete(managerId);
  } catch (e) {
    await ctx.reply("❌ Не смог отправить клиенту. Возможно, клиент не нажимал /start у бота.");
  }
});

/**
 * Payments / Shipping (оставляем как у тебя)
 */
bot.on("shipping_query", async (ctx) => {
  const payload = JSON.parse(ctx.update.shipping_query.invoice_payload);
  const shippingOptions = await woo.getShippingOptions(payload.shippingZone);
  if (shippingOptions.length)
    ctx.answerShippingQuery(true, shippingOptions, undefined);
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
    ctx.reply("Заказ успешно зарегистрирован ✅");
  } else {
    ctx.reply(
      `Ошибка регистрации оплаты, напишите в поддержку.\n
orderId:${payload.orderId}\n
${ctx.update.message.successful_payment.telegram_payment_charge_id}\n
${ctx.update.message.successful_payment.provider_payment_charge_id}
`
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
