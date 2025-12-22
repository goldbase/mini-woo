import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { LabeledPrice } from "@telegraf/types";
import woo from "@/lib/woo";

/**
 * =========================
 * ENV
 * =========================
 */
export const SECRET_HASH = process.env.TELEGRAM_BOT_SECRET || "";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing");
}

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  `https://${process.env.NEXT_PUBLIC_VERCEL_URL || ""}`;

// webhook должен быть абсолютный URL (в проде BASE_PATH обычно https://shop.ergospine.ru)
const WEBHOOK_URL = `${BASE_PATH}/api/telegram-hook?secret_hash=${SECRET_HASH}`;

const ORDERS_CHAT_ID_RAW = process.env.TELEGRAM_CHAT_ID || ""; // закрытая группа заказов
const SUPPORT_STAFF_CHAT_ID_RAW = process.env.TELEGRAM_SUPPORT_STAFF_CHAT_ID || ""; // опционально отдельная staff-группа для лидов/поддержки

function parseChatId(raw: string): number | null {
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

const ORDERS_CHAT_ID = parseChatId(ORDERS_CHAT_ID_RAW); // может быть null
const SUPPORT_STAFF_CHAT_ID = parseChatId(SUPPORT_STAFF_CHAT_ID_RAW); // может быть null

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

const bot = new Telegraf(BOT_TOKEN);

/**
 * =========================
 * UI TEXT
 * =========================
 */
function storeStartText() {
  return (
    "👋 Добро пожаловать в *ErgoSpine*!\n\n" +
    "Выберите действие ниже:"
  );
}

function supportStartText() {
  return (
    "🆘 *Поддержка ErgoSpine*\n\n" +
    "Напишите сюда свой вопрос — менеджер ответит вам в этом чате.\n\n" +
    "Чтобы помочь быстрее, отправьте:\n" +
    "1) что подбираем (матрас / подушку)\n" +
    "2) рост/вес и поза сна\n" +
    "3) есть ли боли (шея/поясница)\n" +
    "4) город доставки\n\n" +
    "📎 Можно прикреплять фото/скрины.\n" +
    "⏱ Обычно отвечаем быстро."
  );
}

function quizStartText() {
  return (
    "😴 *Тест на сон за 2 минуты*\n\n" +
    "Отвечайте кнопками — в конце получите персональный результат и рекомендацию.\n" +
    "Готовы? Поехали! 🚀"
  );
}

function storeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Каталог", BASE_PATH)],
    [
      Markup.button.callback("😴 Тест на сон", "QUIZ_START"),
      Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN"),
    ],
  ]);
}

/**
 * =========================
 * SUPPORT (тикеты)
 * =========================
 */
let ticketSeq = 1000;
const ticketByUser = new Map<number, number>(); // userId -> ticketId
const ticketToUser = new Map<number, number>(); // ticketId -> userId
const managerReplyMode = new Map<number, number>(); // managerId -> userId

function makeUserLabel(ctx: any) {
  const u = ctx.from;
  const full = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  const username = u?.username ? `@${u.username}` : "";
  return `${full || "Пользователь"} ${username}`.trim();
}

async function sendToManagers(text: string, extra?: any) {
  if (!SUPPORT_MANAGERS.length) {
    console.log("⚠️ SUPPORT_MANAGERS is empty. Check TELEGRAM_SUPPORT_MANAGER_IDS / TELEGRAM_MANAGER_CHAT_ID");
    return;
  }

  for (const mid of SUPPORT_MANAGERS) {
    try {
      await bot.telegram.sendMessage(mid, text, extra);
    } catch (e) {
      console.log("Support manager send error:", mid, e);
    }
  }
}

async function sendToStaffGroup(text: string, extra?: any) {
  if (!SUPPORT_STAFF_CHAT_ID) return;
  try {
    await bot.telegram.sendMessage(SUPPORT_STAFF_CHAT_ID, text, extra);
  } catch (e) {
    console.log("Support staff group send error:", e);
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
    [
      Markup.button.callback("💬 Ответить", `SUPPORT_REPLY:${ticketId}`),
      Markup.button.callback("✅ Закрыть", `SUPPORT_CLOSE:${ticketId}`),
    ],
  ]);
}

bot.action("SUPPORT_OPEN", async (ctx) => {
  await ctx.answerCbQuery().catch(() => null);
  await ctx.reply(supportStartText(), { parse_mode: "Markdown" });
});

bot.action(/^SUPPORT_REPLY:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => null);

  const managerId = ctx.from?.id;
  const ticketId = Number((ctx.match as any)[1]);
  const userId = ticketToUser.get(ticketId);

  if (!managerId || !userId) {
    await ctx.reply("❌ Не могу найти пользователя этого тикета.");
    return;
  }

  managerReplyMode.set(managerId, userId);

  await ctx.reply(
    `✍️ Режим ответа включён.\nСледующее сообщение уйдёт клиенту (тикет #${ticketId}).\n\nЧтобы отменить — отправьте /cancel или нажмите «Закрыть».`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Закрыть", `SUPPORT_CLOSE:${ticketId}`)],
    ])
  );
});

bot.action(/^SUPPORT_CLOSE:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => null);

  const managerId = ctx.from?.id;
  const ticketId = Number((ctx.match as any)[1]);
  const userId = ticketToUser.get(ticketId);

  if (userId) {
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
 * =========================
 * QUIZ (лидогенерация)
 * =========================
 */

type QuizStepKey =
  | "age"
  | "weight"
  | "pose"
  | "pain"
  | "mattress_age"
  | "allergy"
  | "partner"
  | "hot";

type QuizState = {
  stepIndex: number;
  answers: Record<QuizStepKey, string>;
  updatedAt: number;
  awaitingContact: boolean;
};

const QUIZ_TTL_MS = 1000 * 60 * 30; // 30 минут
const quizByUser = new Map<number, QuizState>();

const QUIZ_STEPS: { key: QuizStepKey; title: string; options: { label: string; value: string }[] }[] = [
  {
    key: "age",
    title: "1/8 🎂 Ваш возраст?",
    options: [
      { label: "до 30", value: "<30" },
      { label: "30–45", value: "30-45" },
      { label: "45–60", value: "45-60" },
      { label: "60+", value: ">60" },
    ],
  },
  {
    key: "weight",
    title: "2/8 ⚖️ Ваш вес?",
    options: [
      { label: "до 60 кг", value: "<60" },
      { label: "60–90", value: "60-90" },
      { label: "90–120", value: "90-120" },
      { label: "120+", value: ">120" },
    ],
  },
  {
    key: "pose",
    title: "3/8 🛏️ Основная поза сна?",
    options: [
      { label: "на боку", value: "side" },
      { label: "на спине", value: "back" },
      { label: "на животе", value: "stomach" },
      { label: "меняю позы", value: "mixed" },
    ],
  },
  {
    key: "pain",
    title: "4/8 🧠 Просыпаетесь с болью в спине/шее?",
    options: [
      { label: "да, часто", value: "often" },
      { label: "иногда", value: "sometimes" },
      { label: "редко", value: "rare" },
      { label: "нет", value: "no" },
    ],
  },
  {
    key: "mattress_age",
    title: "5/8 🕰️ Сколько лет вашему матрасу?",
    options: [
      { label: "до 3", value: "<3" },
      { label: "3–7", value: "3-7" },
      { label: "7+", value: ">7" },
      { label: "не знаю", value: "unknown" },
    ],
  },
  {
    key: "allergy",
    title: "6/8 🌿 Есть аллергия/астма?",
    options: [
      { label: "да", value: "yes" },
      { label: "нет", value: "no" },
    ],
  },
  {
    key: "partner",
    title: "7/8 👥 Спите один или с партнёром?",
    options: [
      { label: "один", value: "solo" },
      { label: "с партнёром", value: "partner" },
    ],
  },
  {
    key: "hot",
    title: "8/8 🔥 Жарко ли вам ночью?",
    options: [
      { label: "да", value: "yes" },
      { label: "иногда", value: "sometimes" },
      { label: "нет", value: "no" },
    ],
  },
];

function cleanupQuizIfExpired(userId: number) {
  const st = quizByUser.get(userId);
  if (!st) return;
  if (Date.now() - st.updatedAt > QUIZ_TTL_MS) {
    quizByUser.delete(userId);
  }
}

function quizKeyboard(stepIndex: number) {
  const step = QUIZ_STEPS[stepIndex];
  const rows = step.options.map((o) => [Markup.button.callback(o.label, `QZ:${step.key}:${encodeURIComponent(o.value)}`)]);
  return Markup.inlineKeyboard(rows);
}

async function showQuizStep(ctx: any, userId: number) {
  cleanupQuizIfExpired(userId);

  const st = quizByUser.get(userId);
  if (!st) {
    await ctx.reply("Похоже, тест сбросился. Нажмите /quiz чтобы начать заново.");
    return;
  }

  const step = QUIZ_STEPS[st.stepIndex];
  if (!step) {
    await ctx.reply("Тест завершён. Нажмите /quiz чтобы начать заново.");
    return;
  }

  // редактируем предыдущее сообщение (если это callback), иначе отправляем новое
  const text = step.title;
  const kb = quizKeyboard(st.stepIndex);

  try {
    if (ctx.update?.callback_query?.message) {
      await ctx.editMessageText(text, kb);
    } else {
      await ctx.reply(text, kb);
    }
  } catch {
    // если не получилось редактирование — отправим новым
    await ctx.reply(text, kb);
  }
}

function calcScoreAndRecommend(ans: Record<QuizStepKey, string>) {
  // простой скоринг для MVP
  let score = 10;

  if (ans.pain === "often") score -= 3;
  if (ans.pain === "sometimes") score -= 2;
  if (ans.mattress_age === ">7") score -= 3;
  if (ans.mattress_age === "3-7") score -= 2;
  if (ans.pose === "stomach") score -= 2;
  if (ans.hot === "yes") score -= 1;

  if (score < 1) score = 1;
  if (score > 10) score = 10;

  // примитивная логика рекомендации
  let model = "Spinal Duo";
  let why = "универсальный вариант под разные позы сна.";

  if (ans.pose === "side") {
    model = "Back Stretch";
    why = "лучше поддерживает плечо/таз при сне на боку и снижает точки давления.";
  }
  if (ans.pose === "back") {
    model = "Lavender Duo";
    why = "даёт ровную поддержку поясницы и помогает сохранить естественный изгиб.";
  }
  if (ans.pain === "often" || ans.pain === "sometimes") {
    model = "Spinal Duo";
    why = "сбалансированная поддержка + комфорт, часто лучше при болях и усталости.";
  }

  return { score, model, why };
}

function quizResultKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Открыть каталог", BASE_PATH)],
    [
      Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN"),
      Markup.button.callback("📩 Оставить контакт", "QUIZ_LEAVE_CONTACT"),
    ],
  ]);
}

async function sendQuizLeadToManagers(params: {
  userId: number;
  userLabel: string;
  answers: Record<QuizStepKey, string>;
  score: number;
  model: string;
  contactText: string;
}) {
  const { userId, userLabel, answers, score, model, contactText } = params;

  const msg =
    `🧲 *Лид из квиза (Тест на сон)*\n` +
    `Клиент: ${userLabel}\n` +
    `ID: \`${userId}\`\n\n` +
    `Контакт: *${contactText}*\n\n` +
    `Результат: *${score}/10*\n` +
    `Рекомендация: *${model}*\n\n` +
    `Ответы:\n` +
    `• Возраст: ${answers.age}\n` +
    `• Вес: ${answers.weight}\n` +
    `• Поза: ${answers.pose}\n` +
    `• Боли: ${answers.pain}\n` +
    `• Матрас: ${answers.mattress_age}\n` +
    `• Аллергия: ${answers.allergy}\n` +
    `• Партнёр: ${answers.partner}\n` +
    `• Жарко: ${answers.hot}`;

  await sendToManagers(msg, { parse_mode: "Markdown" });
  await sendToStaffGroup(msg, { parse_mode: "Markdown" });
}

async function startQuiz(ctx: any) {
  const userId = ctx.from?.id;
  if (!userId) return;

  quizByUser.set(userId, {
    stepIndex: 0,
    answers: {} as any,
    updatedAt: Date.now(),
    awaitingContact: false,
  });

  await ctx.reply(quizStartText(), { parse_mode: "Markdown" });
  await showQuizStep(ctx, userId);
}

bot.command("quiz", async (ctx) => startQuiz(ctx));
bot.action("QUIZ_START", async (ctx) => {
  await ctx.answerCbQuery().catch(() => null);
  await startQuiz(ctx);
});

bot.action(/^QZ:([^:]+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => null);

  const userId = ctx.from?.id;
  if (!userId) return;

  cleanupQuizIfExpired(userId);

  const st = quizByUser.get(userId);
  if (!st) {
    await ctx.reply("Похоже тест сбросился. Нажмите /quiz чтобы начать заново.");
    return;
  }

  const key = String((ctx.match as any)[1]) as QuizStepKey;
  const value = decodeURIComponent(String((ctx.match as any)[2] || ""));

  const currentStep = QUIZ_STEPS[st.stepIndex];
  if (!currentStep || currentStep.key !== key) {
    // если пользователь нажал кнопку от старого шага — просто перерисуем актуальный шаг
    await showQuizStep(ctx, userId);
    return;
  }

  st.answers[key] = value;
  st.updatedAt = Date.now();
  st.stepIndex += 1;

  if (st.stepIndex < QUIZ_STEPS.length) {
    await showQuizStep(ctx, userId);
    return;
  }

  // финал
  const { score, model, why } = calcScoreAndRecommend(st.answers);

  const text =
    `🏁 *Ваш результат*\n\n` +
    `Ваш балл по сну: *${score}/10*\n\n` +
    `✨ Рекомендация: *${model}*\n` +
    `Почему: ${why}\n\n` +
    `Хотите — менеджер уточнит детали и подберёт идеальную комплектацию под ваши параметры.\n` +
    `Нажмите «📩 Оставить контакт».`;

  st.awaitingContact = false;
  st.updatedAt = Date.now();

  try {
    await ctx.editMessageText(text, { parse_mode: "Markdown", ...quizResultKeyboard() });
  } catch {
    await ctx.reply(text, { parse_mode: "Markdown", ...quizResultKeyboard() });
  }
});

bot.action("QUIZ_LEAVE_CONTACT", async (ctx) => {
  await ctx.answerCbQuery().catch(() => null);

  const userId = ctx.from?.id;
  if (!userId) return;

  cleanupQuizIfExpired(userId);

  const st = quizByUser.get(userId);
  if (!st) {
    await ctx.reply("Похоже, тест сбросился. Нажмите /quiz чтобы пройти заново.");
    return;
  }

  st.awaitingContact = true;
  st.updatedAt = Date.now();

  await ctx.reply(
    "📩 Отлично!\nОтправьте одним сообщением *телефон и город* (например: `+7 999 123-45-67, Сочи`).",
    { parse_mode: "Markdown" }
  );
});

/**
 * =========================
 * START / MENU
 * =========================
 */
bot.start(async (ctx) => {
  const payload = (ctx.startPayload || "").trim();

  if (payload === "support") {
    await ctx.reply(supportStartText(), { parse_mode: "Markdown" });
    return;
  }

  if (payload === "quiz") {
    await startQuiz(ctx);
    return;
  }

  await ctx.reply(storeStartText(), { parse_mode: "Markdown", ...storeKeyboard() });
});

bot.help((ctx) => ctx.reply("Напишите /start чтобы открыть меню.\nКоманды: /quiz"));

// меню-кнопка (по желанию)
bot.command("menu", (ctx) =>
  ctx.setChatMenuButton({
    text: "Каталог",
    type: "web_app",
    web_app: { url: BASE_PATH },
  })
);

/**
 * =========================
 * MESSAGES ROUTER
 * =========================
 */
bot.on(message("text"), async (ctx) => {
  const chatType = ctx.chat?.type;
  const fromId = ctx.from?.id;
  if (!fromId) return;

  // 1) менеджер в режиме ответа поддержки
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

  // не private — игнор
  if (chatType !== "private") return;

  // 2) пользователь оставляет контакт после квиза
  cleanupQuizIfExpired(fromId);
  const qst = quizByUser.get(fromId);
  if (qst?.awaitingContact) {
    qst.awaitingContact = false;
    qst.updatedAt = Date.now();

    const contactText = ctx.message.text.trim();
    const userLabel = makeUserLabel(ctx);
    const { score, model } = calcScoreAndRecommend(qst.answers);

    // отправляем менеджерам лид
    await sendQuizLeadToManagers({
      userId: fromId,
      userLabel,
      answers: qst.answers,
      score,
      model,
      contactText,
    });

    await ctx.reply(
      "✅ Спасибо! Контакт получен.\nМенеджер свяжется с вами и уточнит детали подбора."
    );

    return;
  }

  // 3) обычное сообщение пользователя -> поддержка тикет
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
  await sendToStaffGroup(msg, { parse_mode: "Markdown" });

  await ctx.reply(
    "✅ Принято! Менеджер уже получил ваш запрос.\nЕсли нужно — добавьте детали (город, рост/вес, поза сна)."
  );
});

/**
 * =========================
 * EXISTING: shipping/payment
 * =========================
 */
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

/**
 * =========================
 * WEBHOOK INIT
 * =========================
 */
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
