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

/**
 * =========================
 * SUPPORT SETTINGS
 * =========================
 */
const SUPPORT_CHAT_ID = Number(
  process.env.TELEGRAM_SUPPORT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || 0
);

const SUPPORT_MANAGER_IDS = (process.env.TELEGRAM_SUPPORT_MANAGER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((n) => Number(n))
  .filter((n) => Number.isFinite(n));

function isManager(userId?: number) {
  return !!userId && SUPPORT_MANAGER_IDS.includes(userId);
}

// managerId -> clientId (режим ответа)
const replyMode = new Map<number, number>();

// clientId -> blocked
const blockedClients = new Set<number>();

function userLabel(ctx: any) {
  const first = ctx.from?.first_name || "";
  const last = ctx.from?.last_name || "";
  const name = `${first} ${last}`.trim() || "Без имени";
  const username = ctx.from?.username ? `@${ctx.from.username}` : "";
  const id = ctx.from?.id ? String(ctx.from.id) : "";
  const link = id ? `tg://user?id=${id}` : "";
  return { name, username, id, link };
}

function supportKeyboard(clientId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✍️ Ответить", `support:reply:${clientId}`),
      Markup.button.callback("✅ Закрыть", `support:close:${clientId}`),
    ],
    [Markup.button.callback("⛔️ Заблокировать", `support:block:${clientId}`)],
  ]);
}

/**
 * =========================
 * START / MENU
 * =========================
 */
bot.start(async (ctx) => {
  const text = ctx.message?.text || "";
  const payload = text.split(" ").slice(1).join(" ").trim(); // start payload

  // Поддержка: /start support
  if (payload === "support") {
    await ctx.reply(
      "💬 Поддержка ErgoSpine\n\nНапишите ваш вопрос сюда — менеджер ответит в этом чате."
    );
    return;
  }

  // Магазин
  await ctx.reply(
    "Давайте начнём 😉",
    Markup.inlineKeyboard([Markup.button.webApp("Открыть магазин", BASE_PATH)])
  );
});

bot.help((ctx) => ctx.reply("Команды: /start, /menu, /support"));

bot.command("menu", (ctx) =>
  ctx.setChatMenuButton({
    text: "Store",
    type: "web_app",
    web_app: { url: BASE_PATH },
  })
);

// удобная команда поддержки
bot.command("support", async (ctx) => {
  await ctx.reply(
    "💬 Поддержка ErgoSpine\n\nНапишите ваш вопрос сюда — менеджер ответит в этом чате."
  );
});

/**
 * =========================
 * SUPPORT: manager callback buttons
 * =========================
 */
bot.action(/^support:reply:(\d+)$/, async (ctx) => {
  const managerId = ctx.from?.id;
  if (!isManager(managerId)) {
    await ctx.answerCbQuery("Нет доступа");
    return;
  }

  const clientId = Number(ctx.match[1]);
  replyMode.set(managerId!, clientId);

  await ctx.answerCbQuery("Режим ответа включён");

  // Лучше писать менеджеру в личку бота (чтобы не путалось в группе)
  try {
    await ctx.telegram.sendMessage(
      managerId!,
      `✍️ Режим ответа включён.\nСледующее ваше сообщение отправлю клиенту ID ${clientId}.\n\nЧтобы сменить клиента — нажмите «Ответить» под другим обращением.\nЧтобы выключить — отправьте /stopreply`
    );
  } catch {
    // если менеджеру нельзя писать (не стартовал бота) — хотя бы ответим в группе
    await ctx.reply(
      `✍️ Режим ответа включён для клиента ID ${clientId}. Напишите боту в личку, и я перешлю клиенту.`
    );
  }
});

bot.command("stopreply", async (ctx) => {
  const managerId = ctx.from?.id;
  if (!isManager(managerId)) return;
  replyMode.delete(managerId!);
  await ctx.reply("✅ Режим ответа выключен.");
});

bot.action(/^support:close:(\d+)$/, async (ctx) => {
  const managerId = ctx.from?.id;
  if (!isManager(managerId)) {
    await ctx.answerCbQuery("Нет доступа");
    return;
  }

  const clientId = Number(ctx.match[1]);
  if (replyMode.get(managerId!) === clientId) replyMode.delete(managerId!);

  await ctx.answerCbQuery("Закрыто");
  await ctx.reply(`✅ Тикет закрыт (клиент ID ${clientId}).`);

  // опционально — уведомить клиента:
  try {
    await ctx.telegram.sendMessage(
      clientId,
      "✅ Обращение закрыто. Если появятся вопросы — напишите сюда снова."
    );
  } catch {}
});

bot.action(/^support:block:(\d+)$/, async (ctx) => {
  const managerId = ctx.from?.id;
  if (!isManager(managerId)) {
    await ctx.answerCbQuery("Нет доступа");
    return;
  }

  const clientId = Number(ctx.match[1]);
  blockedClients.add(clientId);
  if (replyMode.get(managerId!) === clientId) replyMode.delete(managerId!);

  await ctx.answerCbQuery("Заблокирован");
  await ctx.reply(`⛔️ Клиент ID ${clientId} заблокирован. Сообщения игнорируются.`);
});

/**
 * =========================
 * TEXT: support routing + fallback
 * =========================
 */
bot.on(message("text"), async (ctx) => {
  const fromId = ctx.from?.id;
  if (!fromId) return;

  const text = ctx.message.text || "";

  // Игнорируем команды (они уже обработаны)
  if (text.startsWith("/")) return;

  // 1) Менеджер пишет боту в личку — это “ответ клиенту”
  if (isManager(fromId) && ctx.chat?.type === "private") {
    const clientId = replyMode.get(fromId);

    if (!clientId) {
      await ctx.reply(
        "Вы не выбрали клиента.\nНажмите «Ответить» под обращением в группе поддержки."
      );
      return;
    }

    // отправляем клиенту
    try {
      await ctx.telegram.sendMessage(clientId, `💬 Поддержка ErgoSpine:\n${text}`);
      await ctx.reply("✅ Отправлено клиенту. Можете писать дальше (режим ответа активен).");
    } catch (e) {
      await ctx.reply("❌ Не смог отправить клиенту (возможно, он не писал боту или заблокировал бота).");
    }
    return;
  }

  // 2) Клиент пишет боту в личку — это обращение в поддержку
  // (важно: мы НЕ мешаемся в группах/каналах — только private)
  if (ctx.chat?.type === "private") {
    if (!SUPPORT_CHAT_ID) {
      await ctx.reply("Поддержка пока не настроена (нет TELEGRAM_SUPPORT_CHAT_ID).");
      return;
    }

    if (blockedClients.has(fromId)) {
      // можно молча игнорить
      return;
    }

    const u = userLabel(ctx);

    const header =
      `🆘 Новое обращение в поддержку\n` +
      `👤 ${u.name} ${u.username}\n` +
      `🆔 ${u.id}\n` +
      (u.link ? `🔗 ${u.link}\n` : "");

    // шлём в закрытую группу поддержки (или ту же, что для заявок — как настроишь)
    await ctx.telegram.sendMessage(
      SUPPORT_CHAT_ID,
      `${header}\n💬 Сообщение:\n${text}`,
      supportKeyboard(fromId)
    );

    await ctx.reply("✅ Сообщение отправлено в поддержку. Мы ответим здесь.");
    return;
  }

  // 3) Всё остальное — старый фолбэк
  await ctx.reply("Hi, I`m Mini Woo. It`s nice to meet you!:) /help");
});

/**
 * =========================
 * PAYMENTS / SHIPPING (твои хендлеры без изменений)
 * =========================
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
    ctx.reply("Order successfully registered!");
  } else
    ctx.reply(`Error registering payment, contact support!\n
        orderId:${payload.orderId}\n
        ${ctx.update.message.successful_payment.telegram_payment_charge_id}\n
        ${ctx.update.message.successful_payment.provider_payment_charge_id}
        `);
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
    photo_url: undefined, //TODO: env
    is_flexible: false, //TODO: env
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
