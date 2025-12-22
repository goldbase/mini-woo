// src/lib/bot.ts
import "dotenv/config";
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
 * Простая in-memory маршрутизация поддержки:
 * - ticketByUser: userId -> ticketId
 * - ticketToUser: ticketId -> userId
 * - managerReplyMode: managerId -> userId (кому сейчас отвечает)
 *
 * ВАЖНО: хранится в памяти процесса. После рестарта PM2 — сбросится.
 * Для MVP нормально. Для “железно” — Redis/DB.
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
    [Markup.button.webApp("🛍️ Каталог", BASE_PATH)],
    [
      Markup.button.callback("🧠 Тест на сон (2 минуты)", "QUIZ_OPEN"),
      Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN"),
    ],
  ]);
}

function supportKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✍️ Написать в поддержку", "SUPPORT_OPEN")],
    [Markup.button.webApp("🛍️ Открыть каталог", BASE_PATH)],
  ]);
}

/** =========================
 *  QUIZ (Тест на сон) — стабильная обработка callback
 *  ========================= */
type QuizState = {
  step: number;
  answers: Record<string, string>;
};

const quizState = new Map<number, QuizState>();

const QUIZ: Array<{
  key: string;
  text: string;
  options: string[];
}> = [
  {
    key: "age",
    text: "1/8 🎂 Ваш возраст?",
    options: ["<30", "30–45", "45–60", "60+"],
  },
  {
    key: "weight",
    text: "2/8 ⚖️ Ваш вес?",
    options: ["<60", "60–90", "90–120", ">120"],
  },
  {
    key: "pose",
    text: "3/8 🛏 Основная поза сна?",
    options: ["На боку", "На спине", "На животе", "Меняю"],
  },
  {
    key: "pain",
    text: "4/8 😣 Просыпаетесь с болью в спине/шее?",
    options: ["Да, часто", "Иногда", "Редко", "Нет"],
  },
  {
    key: "mattress_age",
    text: "5/8 🧾 Сколько лет вашему матрасу?",
    options: ["<3", "3–7", ">7", "Не знаю"],
  },
  {
    key: "allergy",
    text: "6/8 🌿 Есть аллергия/астма?",
    options: ["Да", "Нет", "Не уверен(а)"],
  },
  {
    key: "partner",
    text: "7/8 👥 Спите один или с партнёром?",
    options: ["Один(а)", "С партнёром"],
  },
  {
    key: "hot",
    text: "8/8 🔥 Бывает жарко ночью?",
    options: ["Да", "Иногда", "Нет"],
  },
];

function quizIntroText() {
  return (
    "😴 *Тест на сон ErgoSpine*\n\n" +
    "Ответьте на 8 коротких вопросов — и я дам персональную рекомендацию.\n" +
    "⏱ Время: ~2 минуты.\n\n" +
    "Нажмите «Начать» 👇"
  );
}

function quizStartKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("▶️ Начать тест", "QUIZ_START")],
    [Markup.button.webApp("🛍️ Открыть каталог", BASE_PATH)],
  ]);
}

function quizKeyboard(step: number) {
  return Markup.inlineKeyboard(
    QUIZ[step].options.map((opt) =>
      Markup.button.callback(opt, `QUIZ:${step}:${encodeURIComponent(opt)}`)
    ),
    { columns: 2 }
  );
}

async function sendQuizStep(ctx: any, userId: number) {
  const state = quizState.get(userId);
  if (!state) return;
  const q = QUIZ[state.step];
  await ctx.reply(q.text, quizKeyboard(state.step));
}

function scoreQuiz(answers: Record<string, string>) {
  // Простой скоринг: чем больше “рисковых” ответов — тем ниже оценка сна.
  let score = 10;

  const age = answers.age || "";
  const weight = answers.weight || "";
  const pose = answers.pose || "";
  const pain = answers.pain || "";
  const mattressAge = answers.mattress_age || "";
  const allergy = answers.allergy || "";
  const partner = answers.partner || "";
  const hot = answers.hot || "";

  if (age === "60+") score -= 1;
  if (weight === ">120" || weight === "90–120") score -= 1;

  if (pose === "На животе") score -= 2;
  if (pose === "Меняю") score -= 1;

  if (pain === "Да, часто") score -= 3;
  if (pain === "Иногда") score -= 2;
  if (pain === "Редко") score -= 1;

  if (mattressAge === ">7") score -= 2;
  if (mattressAge === "3–7") score -= 1;
  if (mattressAge === "Не знаю") score -= 1;

  if (allergy === "Да") score -= 1;
  if (hot === "Да") score -= 1;
  if (partner === "С партнёром") score -= 1;

  if (score < 1) score = 1;
  if (score > 10) score = 10;

  let model = "Spinal Duo";
  let reason =
    "универсальная поддержка позвоночника и баланс мягкости/упругости.";

  if (pain === "Да, часто" || pose === "На боку") {
    model = "Back Stretch";
    reason = "отлично разгружает плечо/таз и помогает при сне на боку.";
  }
  if (pose === "На спине" && (pain === "Иногда" || pain === "Да, часто")) {
    model = "Lavender Duo";
    reason = "стабильная поддержка поясницы и комфорт на спине.";
  }
  if (hot === "Да") {
    // как пример: можно рекомендовать более “прохладные” решения/наматрасники
    // но оставим матрас и добавим акцент
    reason += " Плюс стоит выбрать более “дышащие” материалы для комфорта ночью.";
  }

  return { score, model, reason };
}

async function sendToManagers(text: string, extra?: any) {
  if (!SUPPORT_MANAGERS.length) return;
  for (const mid of SUPPORT_MANAGERS) {
    try {
      await bot.telegram.sendMessage(mid, text, extra);
    } catch (e) {
      console.log("Support manager send error:", mid, e);
    }
  }
}

/** =========================
 *  START / MENU
 *  ========================= */
bot.start(async (ctx) => {
  const payload = (ctx.startPayload || "").trim();

  if (payload === "support") {
    await ctx.reply(supportStartText(), {
      parse_mode: "Markdown",
      ...supportKeyboard(),
    });
    return;
  }

  if (payload === "quiz") {
    await ctx.reply(quizIntroText(), { parse_mode: "Markdown", ...quizStartKeyboard() });
    return;
  }

  await ctx.reply(storeStartText(), storeKeyboard());
});

bot.action("SUPPORT_OPEN", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(supportStartText(), { parse_mode: "Markdown" });
});

bot.action("QUIZ_OPEN", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(quizIntroText(), { parse_mode: "Markdown", ...quizStartKeyboard() });
});

bot.action("QUIZ_START", async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  quizState.set(userId, { step: 0, answers: {} });

  await ctx.reply(
    "✅ Поехали! Отвечайте кнопками — так быстрее 🙂",
    { parse_mode: "Markdown" }
  );
  await sendQuizStep(ctx, userId);
});

bot.command("quiz", async (ctx) => {
  const userId = ctx.from.id;
  quizState.set(userId, { step: 0, answers: {} });

  await ctx.reply(
    quizIntroText(),
    { parse_mode: "Markdown", ...quizStartKeyboard() }
  );
});

bot.help((ctx) => ctx.reply("Напишите /start чтобы открыть меню.\nКоманда квиза: /quiz"));

bot.command("menu", (ctx) =>
  ctx.setChatMenuButton({
    text: "Каталог",
    type: "web_app",
    web_app: { url: BASE_PATH },
  })
);

/** =========================
 *  QUIZ: ответы — ВАЖНО: answerCbQuery() сразу!
 *  ========================= */
bot.action(/^QUIZ:(\d+):(.+)$/, async (ctx) => {
  // 🔥 обязательно СРАЗУ
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  const step = Number((ctx.match as any)[1]);
  const value = decodeURIComponent((ctx.match as any)[2]);

  const state = quizState.get(userId);
  if (!state || state.step !== step) {
    await ctx.reply("⚠️ Похоже, тест уже обновился. Нажмите /quiz чтобы начать заново.");
    return;
  }

  const question = QUIZ[step];
  state.answers[question.key] = value;
  state.step += 1;

  // конец квиза
  if (state.step >= QUIZ.length) {
    const answers = state.answers;
    quizState.delete(userId);

    const { score, model, reason } = scoreQuiz(answers);

    // отправим менеджерам лид (опционально)
    const userLabel = makeUserLabel(ctx);
    const leadText =
      `🧠 *Лид из квиза (Тест на сон)*\n` +
      `Клиент: ${userLabel}\n` +
      `ID: \`${userId}\`\n` +
      `Оценка сна: *${score}/10*\n` +
      `Рекомендация: *${model}* — ${reason}\n\n` +
      `Ответы:\n` +
      Object.entries(answers)
        .map(([k, v]) => `• ${k}: ${v}`)
        .join("\n");

    await sendToManagers(leadText, { parse_mode: "Markdown" });

    await ctx.reply(
      `✅ *Готово! Ваш результат: ${score}/10*\n\n` +
        `Рекомендация: *${model}*\n` +
        `Почему: ${reason}\n\n` +
        `Хотите посмотреть варианты в каталоге?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.webApp("🛍️ Открыть каталог", BASE_PATH)],
          [Markup.button.callback("🆘 Задать вопрос менеджеру", "SUPPORT_OPEN")],
        ]),
      }
    );

    return;
  }

  await sendQuizStep(ctx, userId);
});

/** =========================
 *  SUPPORT: менеджерские кнопки и режим ответа
 *  ========================= */
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
    [Markup.button.callback("💬 Ответить", `SUPPORT_REPLY:${ticketId}`)],
    [Markup.button.callback("✅ Закрыть тикет", `SUPPORT_CLOSE:${ticketId}`)],
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
    `✍️ Режим ответа включён.\nСледующее ваше сообщение уйдёт клиенту (тикет #${ticketId}).\n\nЧтобы отменить — отправьте /cancel`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Закрыть тикет", `SUPPORT_CLOSE:${ticketId}`)],
    ])
  );
});

bot.action(/^SUPPORT_CLOSE:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const managerId = ctx.from?.id;
  const ticketId = Number((ctx.match as any)[1]);
  const userId = ticketToUser.get(ticketId);

  if (userId) {
    ticketToUser.delete(ticketId);
    ticketByUser.delete(userId);
    try {
      await bot.telegram.sendMessage(
        userId,
        "✅ Ваш диалог с поддержкой закрыт. Если появятся вопросы — просто напишите снова или нажмите /start."
      );
    } catch (e) {
      // клиент мог не писать боту или заблокировать
    }
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
 * - если пишет пользователь -> создаём тикет и шлём менеджерам
 */
bot.on(message("text"), async (ctx) => {
  const chatType = ctx.chat?.type;
  const fromId = ctx.from?.id;
  if (!fromId) return;

  // менеджер отвечает клиенту
  if (SUPPORT_MANAGERS.includes(fromId) && managerReplyMode.has(fromId)) {
    const userId = managerReplyMode.get(fromId)!;
    const text = ctx.message.text;

    try {
      await bot.telegram.sendMessage(userId, `💬 Ответ поддержки:\n\n${text}`);
      await ctx.reply("✅ Отправлено клиенту.");
    } catch (e) {
      await ctx.reply(
        "❌ Не удалось отправить клиенту. Возможно, клиент не писал боту или заблокировал его."
      );
    }
    return;
  }

  // только private поддержка
  if (chatType !== "private") return;

  // если пользователь прямо пишет /start — не превращаем в тикет
  if (ctx.message.text.trim() === "/start") return;

  // пользователь -> тикет
  const ticketId = ensureTicket(fromId);
  const userLabel = makeUserLabel(ctx);
  const text = ctx.message.text;

  const msg =
    `🆘 *Новый запрос поддержки*\n` +
    `Тикет: #${ticketId}\n` +
    `Клиент: ${userLabel}\n` +
    `ID: \`${fromId}\`\n\n` +
    `Сообщение:\n${text}`;

  await sendToManagers(msg, {
    parse_mode: "Markdown",
    ...managerTicketKeyboard(ticketId),
  });

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
  if (shippingOptions.length)
    ctx.answerShippingQuery(true, shippingOptions, undefined);
  else
    ctx.answerShippingQuery(
      false,
      undefined,
      "No shipping option available at your zone!"
    );
});

bot.on("pre_checkout_query", async (ctx) => {
  const payload = JSON.parse(ctx.update.pre_checkout_query.invoice_payload);
  const orderInfo = ctx.update.pre_checkout_query.order_info!!;
  const res = await woo.updateOrderInfo(payload.orderId, orderInfo);
  if (res.status === 200) await ctx.answerPreCheckoutQuery(true);
  else
    await ctx.answerPreCheckoutQuery(
      false,
      "Problem occurred during update order, contact support!"
    );
});

bot.on(message("successful_payment"), async (ctx) => {
  const payload = JSON.parse(
    ctx.update.message.successful_payment.invoice_payload
  );
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

