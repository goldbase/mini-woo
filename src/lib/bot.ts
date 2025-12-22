// src/lib/bot.ts
import "dotenv/config";
import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { LabeledPrice } from "@telegraf/types";
import woo from "@/lib/woo";

export const SECRET_HASH = process.env.TELEGRAM_BOT_SECRET!!;

/**
 * PUBLIC_URL — домен сайта (для webhook и ссылок)
 * Пример: https://shop.ergospine.ru
 */
const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "");

/**
 * Вспомогательная сборка URL
 */
function joinUrl(base: string, path: string) {
  const b = (base || "").replace(/\/+$/, "");
  const p = (path || "/").replace(/^\/+/, "");
  return `${b}/${p}`;
}

/**
 * URL мини-приложения (web_app)
 * NEXT_PUBLIC_BASE_PATH обычно "/"
 */
const WEBAPP_URL = PUBLIC_URL
  ? joinUrl(PUBLIC_URL, process.env.NEXT_PUBLIC_BASE_PATH || "/")
  : process.env.NEXT_PUBLIC_BASE_PATH || "/";

/**
 * Webhook URL
 */
const WEBHOOK_URL = PUBLIC_URL
  ? `${PUBLIC_URL.replace(/\/+$/, "")}/api/telegram-hook?secret_hash=${SECRET_HASH}`
  : `/api/telegram-hook?secret_hash=${SECRET_HASH}`;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!!;
const bot = new Telegraf(BOT_TOKEN);

/** =========================
 *  SETTINGS / ROUTING
 *  ========================= */

function parseIds(raw: string | undefined): number[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Менеджеры поддержки (private chat IDs)
 * Вы задаёте так:
 * TELEGRAM_SUPPORT_MANAGER_IDS=554...,799...
 */
const SUPPORT_MANAGERS = parseIds(
  process.env.TELEGRAM_SUPPORT_MANAGER_IDS ||
    process.env.TELEGRAM_MANAGER_CHAT_ID ||
    ""
);

/**
 * Закрытая группа для контроля (дублирование):
 * Вы хотите дублировать в TELEGRAM_CHAT_ID=-1003510551621
 * (при желании можно вынести отдельно TELEGRAM_SUPPORT_STAFF_CHAT_ID)
 */
const STAFF_CHAT_ID = Number(
  process.env.TELEGRAM_SUPPORT_STAFF_CHAT_ID ||
    process.env.TELEGRAM_CHAT_ID ||
    ""
);
const HAS_STAFF_CHAT = Number.isFinite(STAFF_CHAT_ID) && STAFF_CHAT_ID < 0;

async function safeSendMessage(chatId: number, text: string, extra?: any) {
  try {
    await bot.telegram.sendMessage(chatId, text, extra);
    return true;
  } catch (e) {
    console.log("sendMessage error:", chatId, e);
    return false;
  }
}

async function sendToManagers(text: string, extra?: any) {
  if (!SUPPORT_MANAGERS.length) return;
  for (const mid of SUPPORT_MANAGERS) {
    await safeSendMessage(mid, text, extra);
  }
}

async function sendToStaff(text: string, extra?: any) {
  if (!HAS_STAFF_CHAT) return;
  await safeSendMessage(STAFF_CHAT_ID, text, extra);
}

function makeUserLabel(from: any) {
  const full = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim();
  const username = from?.username ? `@${from.username}` : "";
  return `${full || "Пользователь"} ${username}`.trim();
}

/** =========================
 *  UI TEXTS / KEYBOARDS
 *  ========================= */

function storeStartText() {
  return "Добро пожаловать в ErgoSpine 👋\nВыберите действие:";
}

function supportStartText() {
  return (
    "🆘 *Поддержка ErgoSpine*\n\n" +
    "Напишите сюда свой вопрос — и менеджер ответит вам в этом чате.\n\n" +
    "Чтобы помочь быстрее, отправьте:\n" +
    "1) что подбираем (матрас / подушку)\n" +
    "2) рост/вес, поза сна\n" +
    "3) есть ли боли (шея/поясница)\n" +
    "4) город доставки\n\n" +
    "📎 Можно прикреплять фото/скрины.\n" +
    "⏱ Обычно отвечаем быстро."
  );
}

function quizStartText() {
  return (
    "😴 *Тест на сон (2 минуты)*\n\n" +
    "Ответьте на несколько вопросов — и я дам персональную рекомендацию.\n" +
    "В конце попросим контакты (имя + телефон), чтобы менеджер мог связаться.\n\n" +
    "Поехали?"
  );
}

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Каталог", WEBAPP_URL)],
    [
      Markup.button.callback("😴 Тест на сон", "QUIZ_START"),
      Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN"),
    ],
  ]);
}

function afterQuizKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Открыть каталог", WEBAPP_URL)],
    [Markup.button.callback("🆘 Написать в поддержку", "SUPPORT_OPEN")],
  ]);
}

/** =========================
 *  SUPPORT: TICKETS
 *  =========================
 * In-memory маршрутизация тикетов (после рестарта сбросится — для MVP норм)
 */

let ticketSeq = 1000;
const ticketByUser = new Map<number, number>(); // userId -> ticketId
const ticketToUser = new Map<number, number>(); // ticketId -> userId
const managerReplyMode = new Map<number, number>(); // managerId -> userId

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

bot.action("SUPPORT_OPEN", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.reply(supportStartText(), { parse_mode: "Markdown" });
});

bot.action(/^SUPPORT_REPLY:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const managerId = ctx.from?.id;
  const ticketId = Number((ctx.match as any)[1]);
  const userId = ticketToUser.get(ticketId);

  if (!managerId || !userId) {
    await ctx.reply("Не могу найти пользователя этого тикета.");
    return;
  }

  managerReplyMode.set(managerId, userId);

  await ctx.reply(
    `✍️ Режим ответа включён.\nСледующее ваше сообщение уйдёт клиенту (тикет #${ticketId}).\n\nОтмена: /cancel`,
    Markup.inlineKeyboard([[Markup.button.callback("✅ Закрыть тикет", `SUPPORT_CLOSE:${ticketId}`)]])
  );
});

bot.action(/^SUPPORT_CLOSE:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
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

/** =========================
 *  QUIZ (in-memory)
 *  ========================= */

type QuizStep =
  | "age"
  | "weight"
  | "pose"
  | "pain"
  | "mattressAge"
  | "allergy"
  | "partner"
  | "hot"
  | "contact_name"
  | "contact_phone"
  | "contact_address"
  | "done";

type QuizSession = {
  version: number; // защита от “старых” callback
  step: QuizStep;
  answers: Record<string, string>;
  createdAt: number;
};

const quizSessionByUser = new Map<number, QuizSession>();
let quizVersionSeq = 1;

function resetQuiz(userId: number) {
  quizSessionByUser.set(userId, {
    version: ++quizVersionSeq,
    step: "age",
    answers: {},
    createdAt: Date.now(),
  });
}

function getQuiz(userId: number): QuizSession | null {
  return quizSessionByUser.get(userId) || null;
}

// callback формат: Q:<ver>:<step>:<value>
function qData(ver: number, step: QuizStep, value: string) {
  // Важно: callback_data <= 64 байт
  return `Q:${ver}:${step}:${value}`.slice(0, 64);
}

function quizKeyboard(ver: number, step: QuizStep) {
  if (step === "age") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("до 30", qData(ver, "age", "<30"))],
      [Markup.button.callback("30–45", qData(ver, "age", "30-45"))],
      [Markup.button.callback("45–60", qData(ver, "age", "45-60"))],
      [Markup.button.callback("60+", qData(ver, "age", "60+"))],
    ]);
  }
  if (step === "weight") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("до 60 кг", qData(ver, "weight", "<60"))],
      [Markup.button.callback("60–90 кг", qData(ver, "weight", "60-90"))],
      [Markup.button.callback("90–120 кг", qData(ver, "weight", "90-120"))],
      [Markup.button.callback("120+ кг", qData(ver, "weight", "120+"))],
    ]);
  }
  if (step === "pose") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("На боку", qData(ver, "pose", "side"))],
      [Markup.button.callback("На спине", qData(ver, "pose", "back"))],
      [Markup.button.callback("На животе", qData(ver, "pose", "stomach"))],
      [Markup.button.callback("Меняю позы", qData(ver, "pose", "mixed"))],
    ]);
  }
  if (step === "pain") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Да, часто", qData(ver, "pain", "often"))],
      [Markup.button.callback("Иногда", qData(ver, "pain", "sometimes"))],
      [Markup.button.callback("Редко", qData(ver, "pain", "rare"))],
      [Markup.button.callback("Нет", qData(ver, "pain", "no"))],
    ]);
  }
  if (step === "mattressAge") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("До 3 лет", qData(ver, "mattressAge", "<3"))],
      [Markup.button.callback("3–7 лет", qData(ver, "mattressAge", "3-7"))],
      [Markup.button.callback("7+ лет", qData(ver, "mattressAge", "7+"))],
      [Markup.button.callback("Не знаю", qData(ver, "mattressAge", "unknown"))],
    ]);
  }
  if (step === "allergy") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Да", qData(ver, "allergy", "yes"))],
      [Markup.button.callback("Нет", qData(ver, "allergy", "no"))],
    ]);
  }
  if (step === "partner") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Один(а)", qData(ver, "partner", "alone"))],
      [Markup.button.callback("С партнёром", qData(ver, "partner", "with"))],
    ]);
  }
  if (step === "hot") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Да", qData(ver, "hot", "yes"))],
      [Markup.button.callback("Иногда", qData(ver, "hot", "sometimes"))],
      [Markup.button.callback("Нет", qData(ver, "hot", "no"))],
    ]);
  }

  return Markup.inlineKeyboard([[Markup.button.callback("Начать заново", "QUIZ_START")]]);
}

function quizQuestionText(step: QuizStep) {
  switch (step) {
    case "age":
      return "1/8 🧑‍🦱 Ваш возраст?";
    case "weight":
      return "2/8 ⚖️ Ваш вес?";
    case "pose":
      return "3/8 🛏️ Основная поза сна?";
    case "pain":
      return "4/8 💢 Просыпаетесь с болью в спине/шее?";
    case "mattressAge":
      return "5/8 ⏳ Матрасу сколько лет?";
    case "allergy":
      return "6/8 🌿 Есть аллергия/астма?";
    case "partner":
      return "7/8 👥 Спите один(а) или с партнёром?";
    case "hot":
      return "8/8 🔥 Жарко ли вам ночью?";
    default:
      return "Ок 🙂";
  }
}

function nextStep(step: QuizStep): QuizStep {
  if (step === "age") return "weight";
  if (step === "weight") return "pose";
  if (step === "pose") return "pain";
  if (step === "pain") return "mattressAge";
  if (step === "mattressAge") return "allergy";
  if (step === "allergy") return "partner";
  if (step === "partner") return "hot";
  return "done";
}

function computeQuizResult(answers: Record<string, string>) {
  // скоринг 0..10
  let score = 10;

  if (answers.pain === "often") score -= 3;
  if (answers.pain === "sometimes") score -= 2;
  if (answers.pain === "rare") score -= 1;

  if (answers.mattressAge === "7+") score -= 3;
  if (answers.mattressAge === "3-7") score -= 2;

  if (answers.pose === "stomach") score -= 2;
  if (answers.hot === "yes") score -= 1;

  if (answers.weight === "120+") score -= 2;
  if (answers.weight === "90-120") score -= 1;

  score = Math.max(0, Math.min(10, score));

  let model = "Spinal Duo";
  let reason = "универсальная поддержка и баланс комфорта/жёсткости.";

  if (answers.pose === "side") {
    model = "Back Stretch";
    reason = "лучше снимает давление в плечах/тазу при сне на боку.";
  }
  if (answers.pain === "often" || answers.pain === "sometimes") {
    model = "Lavender Duo";
    reason = "акцент на правильной поддержке и снижении нагрузки на спину/шею.";
  }

  return { score, model, reason };
}

async function sendQuizLead(from: any, answers: Record<string, string>, result: any) {
  const userId = Number(from?.id);
  const userLabel = makeUserLabel(from);

  const pretty = (k: string, v: string) => `${k}: ${v}`;

  // ✅ ВОТ ЗДЕСЬ как раз и нужны ваши строки pretty("Имя"...)
  const lines = [
    "😴 *Лид из квиза (Тест на сон)*",
    `Клиент: ${userLabel}`,
    `ID: \`${userId}\``,
    "",
    "*Ответы:*",
    pretty("Возраст", answers.age || "-"),
    pretty("Вес", answers.weight || "-"),
    pretty("Поза", answers.pose || "-"),
    pretty("Боль", answers.pain || "-"),
    pretty("Возраст матраса", answers.mattressAge || "-"),
    pretty("Аллергия", answers.allergy || "-"),
    pretty("Партнёр", answers.partner || "-"),
    pretty("Жарко ночью", answers.hot || "-"),
    "",
    "*Контакты:*",
    pretty("Имя", answers.contact_name || "-"),
    pretty("Телефон", answers.contact_phone || "-"),
    pretty("Адрес", answers.contact_address || "(не указан)"),
    "",
    `*Скор:* ${result.score}/10`,
    `*Рекомендация:* ${result.model}`,
    `*Почему:* ${result.reason}`,
  ];

  const text = lines.join("\n");

  // 1) менеджерам
  await sendToManagers(text, { parse_mode: "Markdown" });

  // 2) дубль в закрытую группу контроля
  await sendToStaff(text, { parse_mode: "Markdown" });
}

/** =========================
 *  START / MENU / QUIZ ENTRY
 *  ========================= */

bot.start(async (ctx) => {
  const payload = (ctx.startPayload || "").trim();

  // /start support
  if (payload === "support") {
    await ctx.reply(supportStartText(), { parse_mode: "Markdown" });
    return;
  }

  // /start quiz
  if (payload === "quiz") {
    resetQuiz(ctx.from!.id);
    const q = getQuiz(ctx.from!.id)!;
    await ctx.reply(quizStartText(), { parse_mode: "Markdown" });
    await ctx.reply(quizQuestionText(q.step), quizKeyboard(q.version, q.step));
    return;
  }

  await ctx.reply(storeStartText(), mainKeyboard());
});

bot.help((ctx) => ctx.reply("Напишите /start чтобы открыть меню. Или /quiz чтобы начать тест."));

bot.command("menu", (ctx) =>
  ctx.setChatMenuButton({
    text: "Каталог",
    type: "web_app",
    web_app: { url: WEBAPP_URL },
  })
);

bot.command("quiz", async (ctx) => {
  resetQuiz(ctx.from!.id);
  const q = getQuiz(ctx.from!.id)!;
  await ctx.reply(quizStartText(), { parse_mode: "Markdown" });
  await ctx.reply(quizQuestionText(q.step), quizKeyboard(q.version, q.step));
});

bot.action("QUIZ_START", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  resetQuiz(ctx.from!.id);
  const q = getQuiz(ctx.from!.id)!;
  await ctx.reply(quizStartText(), { parse_mode: "Markdown" });
  await ctx.reply(quizQuestionText(q.step), quizKeyboard(q.version, q.step));
});

/** =========================
 *  QUIZ CALLBACK HANDLER
 *  ========================= */

bot.action(/^Q:(\d+):([a-zA-Z_]+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});

  const userId = ctx.from?.id;
  if (!userId) return;

  const ver = Number((ctx.match as any)[1]);
  const step = String((ctx.match as any)[2]) as QuizStep;
  const value = String((ctx.match as any)[3]);

  const q = getQuiz(userId);
  if (!q) {
    await ctx.reply("Похоже, тест сбросился. Нажмите /quiz чтобы начать заново.");
    return;
  }

  if (q.version !== ver) {
    await ctx.reply("Похоже, тест обновился. Нажмите /quiz чтобы начать заново.");
    return;
  }

  if (q.step !== step) {
    await ctx.reply("Похоже, вы нажали кнопку из прошлого вопроса. Нажмите /quiz чтобы начать заново.");
    return;
  }

  // сохраняем ответ
  q.answers[step] = value;

  // следующий шаг среди кнопочных
  const ns = nextStep(step);
  q.step = ns;

  // вопросы кнопками — красиво редактируем то же сообщение
  if (ns !== "done") {
    await ctx
      .editMessageText(quizQuestionText(ns), quizKeyboard(q.version, ns) as any)
      .catch(async () => {
        // fallback если edit не сработал
        await ctx.reply(quizQuestionText(ns), quizKeyboard(q.version, ns));
      });
    return;
  }

  // Финал кнопочной части
  const result = computeQuizResult(q.answers);

  // заменяем последнее сообщение итогом
  await ctx
    .editMessageText(
      `✅ *Готово! Ваш балл по сну:* *${result.score}/10*\n\n` +
        `Рекомендация: *${result.model}*\n` +
        `Почему: ${result.reason}\n\n` +
        `📩 Чтобы мы могли связаться и помочь точнее — оставьте контакты.`,
      { parse_mode: "Markdown", ...(afterQuizKeyboard() as any) }
    )
    .catch(async () => {
      await ctx.reply(
        `✅ *Готово! Ваш балл по сну:* *${result.score}/10*\n\n` +
          `Рекомендация: *${result.model}*\n` +
          `Почему: ${result.reason}\n\n` +
          `📩 Чтобы мы могли связаться и помочь точнее — оставьте контакты.`,
        { parse_mode: "Markdown", ...(afterQuizKeyboard() as any) }
      );
    });

  // дальше — контакты текстом
  q.step = "contact_name";
  await ctx.reply("👤 Напишите *имя* (обязательно):", { parse_mode: "Markdown" });
});

/** =========================
 *  TEXT MESSAGES: QUIZ CONTACT + SUPPORT + MANAGER REPLY
 *  ========================= */

bot.on(message("text"), async (ctx) => {
  const fromId = ctx.from?.id;
  if (!fromId) return;

  const chatType = ctx.chat?.type; // ✅ важно, раньше у вас могло быть не объявлено
  const textRaw = (ctx.message.text || "").trim();

  /** ====== 1) MANAGER REPLY MODE (support) ====== */
  if (SUPPORT_MANAGERS.includes(fromId) && managerReplyMode.has(fromId)) {
    const userId = managerReplyMode.get(fromId)!;

    try {
      await bot.telegram.sendMessage(userId, `💬 *Ответ поддержки*\n\n${textRaw}`, {
        parse_mode: "Markdown",
      });
      await ctx.reply("✅ Отправлено клиенту.");
    } catch (e) {
      await ctx.reply(
        "❌ Не удалось отправить клиенту. Возможно, клиент не писал боту или заблокировал его."
      );
    }
    return;
  }

  /** ====== 2) QUIZ CONTACT FLOW (приоритетнее поддержки) ====== */
  const q = getQuiz(fromId);
  if (q && chatType === "private") {
    // Имя
    if (q.step === "contact_name") {
      if (textRaw.length < 2) {
        await ctx.reply("Имя слишком короткое. Напишите, пожалуйста, имя ещё раз 🙂");
        return;
      }
      q.answers.contact_name = textRaw;
      q.step = "contact_phone";
      await ctx.reply("📞 Теперь напишите *телефон* (обязательно, можно с +7):", {
        parse_mode: "Markdown",
      });
      return;
    }

    // Телефон
    if (q.step === "contact_phone") {
      const phoneOk = /^[\d\s+()-]{10,}$/.test(textRaw);
      if (!phoneOk) {
        await ctx.reply("Похоже, телефон некорректный. Пример: +7 999 123-45-67");
        return;
      }
      q.answers.contact_phone = textRaw;
      q.step = "contact_address";

      await ctx.reply(
        "🏠 Адрес доставки (необязательно).\n" +
          "Если пока не знаете — напишите *-*\n" +
          "Или укажите город/район, чтобы посчитать доставку.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Адрес (опционально) -> отправляем лид
    if (q.step === "contact_address") {
      q.answers.contact_address = textRaw === "-" ? "" : textRaw;

      const result = computeQuizResult(q.answers);

      await ctx.reply(
        "✅ Спасибо! Контакты получены.\nМенеджер свяжется с вами и поможет подобрать лучший вариант."
      );

      await sendQuizLead(ctx.from, q.answers, result);

      // закрываем сессию
      quizSessionByUser.delete(fromId);
      return;
    }
  }

  /** ====== 3) SUPPORT: only private ====== */
  if (chatType !== "private") return;

  const t = textRaw.toLowerCase();
  if (t === "поддержка" || t === "help" || t === "/support") {
    await ctx.reply(supportStartText(), { parse_mode: "Markdown" });
    return;
  }

  // обычный пользователь -> создаём тикет и шлём менеджерам (+ дубль в группу)
  const ticketId = ensureTicket(fromId);
  const userLabel = makeUserLabel(ctx.from);

  const msg =
    `🆘 *Новый запрос поддержки*\n` +
    `Тикет: #${ticketId}\n` +
    `Клиент: ${userLabel}\n` +
    `ID: \`${fromId}\`\n\n` +
    `Сообщение:\n${textRaw}`;

  const extra = { parse_mode: "Markdown", ...managerTicketKeyboard(ticketId) };

  await sendToManagers(msg, extra);
  await sendToStaff(msg, extra); // ✅ дубль в закрытую группу контроля

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

/** =========================
 *  WEBHOOK INIT
 *  ========================= */

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
