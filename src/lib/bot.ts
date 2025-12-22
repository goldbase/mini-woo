// src/lib/bot.ts
import "dotenv/config";
import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { LabeledPrice } from "@telegraf/types";
import woo from "@/lib/woo";

/**
 * =========================
 * ENV
 * =========================
 */
export const SECRET_HASH = process.env.TELEGRAM_BOT_SECRET!!;

const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "");

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/"; // для WebApp (обычно "/")

const WEB_APP_URL = PUBLIC_URL
  ? `${PUBLIC_URL}${BASE_PATH.startsWith("/") ? BASE_PATH : `/${BASE_PATH}`}`
  : BASE_PATH; // fallback (на случай локалки)

const WEBHOOK_URL = PUBLIC_URL
  ? `${PUBLIC_URL}/api/telegram-hook?secret_hash=${SECRET_HASH}`
  : `${BASE_PATH}/api/telegram-hook?secret_hash=${SECRET_HASH}`;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!!;

// Закрытая группа для дубля (контроль). У тебя это TELEGRAM_CHAT_ID=-100....
const STAFF_GROUP_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();

const bot = new Telegraf(BOT_TOKEN);

/**
 * =========================
 * HELPERS: safe send / html escape
 * =========================
 */
function escapeHtml(input: string) {
  return (input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlLine(label: string, value: string) {
  return `• <b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`;
}

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

async function safeSendMessage(chatId: string | number, text: string, extra?: any) {
  try {
    await bot.telegram.sendMessage(chatId as any, text, extra);
  } catch (e) {
    console.log("sendMessage error:", chatId, e);
  }
}

async function sendToManagers(text: string, extra?: any) {
  if (!SUPPORT_MANAGERS.length) return;
  for (const mid of SUPPORT_MANAGERS) {
    await safeSendMessage(mid, text, extra);
  }
}

async function sendToStaffGroup(text: string, extra?: any) {
  if (!STAFF_GROUP_CHAT_ID) return;
  await safeSendMessage(STAFF_GROUP_CHAT_ID, text, extra);
}

function userLabelFrom(from: any) {
  const full = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim();
  const username = from?.username ? `@${from.username}` : "";
  const base = (full || "Пользователь").trim();
  return username ? `${base} (${username})` : base;
}

/**
 * =========================
 * MAIN UI (start)
 * =========================
 */
function mainMenuTextHTML() {
  return (
    `👋 <b>ErgoSpine</b>\n\n` +
    `Выберите действие:\n` +
    `🛍️ Каталог — открыть магазин\n` +
    `🧠 Тест на сон — получить персональную рекомендацию\n` +
    `🆘 Поддержка — задать вопрос менеджеру`
  );
}

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Каталог", WEB_APP_URL)],
    [Markup.button.callback("🧠 Тест на сон", "QUIZ_OPEN")],
    [Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN")],
  ]);
}

/**
 * =========================
 * SUPPORT (tickets)
 * =========================
 * MVP in-memory, после рестарта сбрасывается.
 */
let ticketSeq = 1000;
const ticketByUser = new Map<number, number>();      // userId -> ticketId
const ticketToUser = new Map<number, number>();      // ticketId -> userId
const managerReplyMode = new Map<number, number>();  // managerId -> userId

function supportStartTextHTML() {
  return (
    `🆘 <b>Поддержка ErgoSpine</b>\n\n` +
    `Напишите сюда ваш вопрос — менеджер ответит вам в этом чате.\n\n` +
    `Чтобы помочь быстрее, пожалуйста, укажите:\n` +
    `1) что хотите подобрать (матрас / подушку)\n` +
    `2) рост/вес, поза сна\n` +
    `3) есть ли боли (шея/поясница)\n` +
    `4) город доставки\n\n` +
    `📎 Можно прикреплять фото/скрины.\n` +
    `⏱ Обычно отвечаем быстро.`
  );
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
    [Markup.button.callback("💬 Ответить", `SUPPORT_REPLY:${ticketId}`)],
    [Markup.button.callback("✅ Закрыть тикет", `SUPPORT_CLOSE:${ticketId}`)],
  ]);
}

/**
 * =========================
 * QUIZ (lead generator)
 * =========================
 */

type QuizAnswers = {
  age?: "lt30" | "30_45" | "45_60" | "gt60";
  weight?: "lt60" | "60_90" | "90_120" | "gt120";
  pose?: "side" | "back" | "stomach" | "mixed";
  pain?: "often" | "sometimes" | "rarely" | "no";
  mattress_age?: "lt3" | "3_7" | "gt7" | "unknown";
  allergy?: "yes" | "no";
  partner?: "alone" | "with";
  hot?: "yes" | "sometimes" | "no";

  contact_name?: string;
  contact_phone?: string;
  contact_address?: string;
};

type QuizSession = {
  step:
    | "age"
    | "weight"
    | "pose"
    | "pain"
    | "mattress_age"
    | "allergy"
    | "partner"
    | "hot"
    | "done_buttons"
    | "contact_name"
    | "contact_phone"
    | "contact_address";
  answers: QuizAnswers;
  msg?: { chatId: number; messageId: number }; // для красивого edit
  lastResult?: { score: number; model: string; reason: string }; // чтобы одинаково отправить клиенту + в лид
};

const quizSessionByUser = new Map<number, QuizSession>();

function quizIntroTextHTML() {
  return (
    `🧠 <b>Тест на сон (2 минуты)</b>\n\n` +
    `Ответьте на несколько вопросов — и вы получите персональную рекомендацию по матрасу.\n\n` +
    `Поехали 👇`
  );
}

function quizQuestionTextHTML(step: QuizSession["step"]) {
  switch (step) {
    case "age":
      return "1/8 👤 Ваш возраст?";
    case "weight":
      return "2/8 ⚖️ Ваш вес?";
    case "pose":
      return "3/8 🛌 Основная поза сна?";
    case "pain":
      return "4/8 😣 Просыпаетесь с болью в спине/шее?";
    case "mattress_age":
      return "5/8 🧾 Сколько лет вашему матрасу?";
    case "allergy":
      return "6/8 🌿 Есть аллергия/астма?";
    case "partner":
      return "7/8 👥 Спите один или с партнёром?";
    case "hot":
      return "8/8 🔥 Бывает жарко ночью?";
    default:
      return "";
  }
}

function quizKeyboard(step: QuizSession["step"]) {
  // callback_data: Q:<step>:<value>
  switch (step) {
    case "age":
      return Markup.inlineKeyboard([
        [Markup.button.callback("До 30", "Q:age:lt30")],
        [Markup.button.callback("30–45", "Q:age:30_45")],
        [Markup.button.callback("45–60", "Q:age:45_60")],
        [Markup.button.callback("60+", "Q:age:gt60")],
      ]);
    case "weight":
      return Markup.inlineKeyboard([
        [Markup.button.callback("До 60 кг", "Q:weight:lt60")],
        [Markup.button.callback("60–90 кг", "Q:weight:60_90")],
        [Markup.button.callback("90–120 кг", "Q:weight:90_120")],
        [Markup.button.callback("120+ кг", "Q:weight:gt120")],
      ]);
    case "pose":
      return Markup.inlineKeyboard([
        [Markup.button.callback("На боку", "Q:pose:side")],
        [Markup.button.callback("На спине", "Q:pose:back")],
        [Markup.button.callback("На животе", "Q:pose:stomach")],
        [Markup.button.callback("Меняю позы", "Q:pose:mixed")],
      ]);
    case "pain":
      return Markup.inlineKeyboard([
        [Markup.button.callback("Да, часто", "Q:pain:often")],
        [Markup.button.callback("Иногда", "Q:pain:sometimes")],
        [Markup.button.callback("Редко", "Q:pain:rarely")],
        [Markup.button.callback("Нет", "Q:pain:no")],
      ]);
    case "mattress_age":
      return Markup.inlineKeyboard([
        [Markup.button.callback("Меньше 3 лет", "Q:mattress_age:lt3")],
        [Markup.button.callback("3–7 лет", "Q:mattress_age:3_7")],
        [Markup.button.callback("Больше 7 лет", "Q:mattress_age:gt7")],
        [Markup.button.callback("Не знаю", "Q:mattress_age:unknown")],
      ]);
    case "allergy":
      return Markup.inlineKeyboard([
        [Markup.button.callback("Да", "Q:allergy:yes")],
        [Markup.button.callback("Нет", "Q:allergy:no")],
      ]);
    case "partner":
      return Markup.inlineKeyboard([
        [Markup.button.callback("Один", "Q:partner:alone")],
        [Markup.button.callback("С партнёром", "Q:partner:with")],
      ]);
    case "hot":
      return Markup.inlineKeyboard([
        [Markup.button.callback("Да", "Q:hot:yes")],
        [Markup.button.callback("Иногда", "Q:hot:sometimes")],
        [Markup.button.callback("Нет", "Q:hot:no")],
      ]);
    default:
      return Markup.inlineKeyboard([]);
  }
}

function nextQuizStep(step: QuizSession["step"]): QuizSession["step"] {
  switch (step) {
    case "age":
      return "weight";
    case "weight":
      return "pose";
    case "pose":
      return "pain";
    case "pain":
      return "mattress_age";
    case "mattress_age":
      return "allergy";
    case "allergy":
      return "partner";
    case "partner":
      return "hot";
    case "hot":
      return "done_buttons";
    default:
      return "done_buttons";
  }
}

function labelAge(v?: QuizAnswers["age"]) {
  switch (v) {
    case "lt30": return "до 30";
    case "30_45": return "30–45";
    case "45_60": return "45–60";
    case "gt60": return "60+";
    default: return "-";
  }
}
function labelWeight(v?: QuizAnswers["weight"]) {
  switch (v) {
    case "lt60": return "до 60 кг";
    case "60_90": return "60–90 кг";
    case "90_120": return "90–120 кг";
    case "gt120": return "120+ кг";
    default: return "-";
  }
}
function labelPose(v?: QuizAnswers["pose"]) {
  switch (v) {
    case "side": return "на боку";
    case "back": return "на спине";
    case "stomach": return "на животе";
    case "mixed": return "меняю позы";
    default: return "-";
  }
}
function labelPain(v?: QuizAnswers["pain"]) {
  switch (v) {
    case "often": return "часто";
    case "sometimes": return "иногда";
    case "rarely": return "редко";
    case "no": return "нет";
    default: return "-";
  }
}
function labelMattressAge(v?: QuizAnswers["mattress_age"]) {
  switch (v) {
    case "lt3": return "меньше 3 лет";
    case "3_7": return "3–7 лет";
    case "gt7": return "больше 7 лет";
    case "unknown": return "не знаю";
    default: return "-";
  }
}
function labelYesNo(v?: "yes" | "no" | undefined) {
  switch (v) {
    case "yes": return "да";
    case "no": return "нет";
    default: return "-";
  }
}
function labelPartner(v?: QuizAnswers["partner"]) {
  switch (v) {
    case "alone": return "один";
    case "with": return "с партнёром";
    default: return "-";
  }
}
function labelHot(v?: QuizAnswers["hot"]) {
  switch (v) {
    case "yes": return "да";
    case "sometimes": return "иногда";
    case "no": return "нет";
    default: return "-";
  }
}

function computeQuizResult(answers: QuizAnswers) {
  let score = 10;

  if (answers.pain === "often") score -= 4;
  else if (answers.pain === "sometimes") score -= 2;
  else if (answers.pain === "rarely") score -= 1;

  if (answers.mattress_age === "gt7") score -= 3;
  else if (answers.mattress_age === "3_7") score -= 2;
  else if (answers.mattress_age === "unknown") score -= 1;

  if (answers.pose === "stomach") score -= 2;
  else if (answers.pose === "mixed") score -= 1;

  if (answers.weight === "gt120") score -= 2;
  else if (answers.weight === "90_120") score -= 1;

  if (answers.hot === "yes") score -= 1;

  if (score < 1) score = 1;

  let model = "Spinal Duo";
  let reason = "универсальная поддержка позвоночника и комфорт для большинства поз сна.";

  if (answers.pose === "side") {
    model = "Back Stretch";
    reason = "лучше поддерживает плечо и бедро при сне на боку, снижая давление и улучшая расслабление.";
  } else if (answers.pose === "back") {
    model = "Lavender Duo";
    reason = "даёт ровную поддержку поясницы и естественный изгиб позвоночника при сне на спине.";
  }

  if (
    (answers.pain === "often" || answers.pain === "sometimes") &&
    (answers.mattress_age === "3_7" || answers.mattress_age === "gt7")
  ) {
    model = "Spinal Duo";
    reason = "при болях и изношенном матрасе важнее стабильная поддержка и выравнивание осанки во сне.";
  }

  return { score, model, reason };
}

function quizResultTextHTML(result: { score: number; model: string; reason: string }) {
  return (
    `✅ <b>Результат теста</b>\n\n` +
    `Ваш балл по сну: <b>${result.score}/10</b>\n` +
    `Рекомендация: <b>${escapeHtml(result.model)}</b>\n` +
    `Почему: ${escapeHtml(result.reason)}\n\n` +
    `🛍️ Откройте каталог — покажем подходящие варианты.`
  );
}

function afterQuizKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Открыть каталог", WEB_APP_URL)],
    [Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN")],
  ]);
}

async function sendQuizLeadToManagersAndGroup(from: any, answers: QuizAnswers, result: { score: number; model: string; reason: string }) {
  const label = userLabelFrom(from);
  const uid = String(from?.id || "");

  const name = answers.contact_name || "-";
  const phone = answers.contact_phone || "-";
  const address = answers.contact_address ? answers.contact_address : "(не указан)";

  const msg =
    `🧠 <b>Лид из квиза «Тест на сон»</b>\n\n` +
    `${htmlLine("Клиент", label)}\n` +
    `${htmlLine("ID", uid)}\n\n` +
    `📋 <b>Контакты</b>\n` +
    `${htmlLine("Имя", name)}\n` +
    `${htmlLine("Телефон", phone)}\n` +
    `${htmlLine("Адрес", address)}\n\n` +
    `🎯 <b>Результат</b>\n` +
    `${htmlLine("Балл", `${result.score}/10`)}\n` +
    `${htmlLine("Рекомендация", result.model)}\n` +
    `${htmlLine("Почему", result.reason)}\n\n` +
    `🧾 <b>Ответы</b>\n` +
    `${htmlLine("Возраст", labelAge(answers.age))}\n` +
    `${htmlLine("Вес", labelWeight(answers.weight))}\n` +
    `${htmlLine("Поза", labelPose(answers.pose))}\n` +
    `${htmlLine("Боли", labelPain(answers.pain))}\n` +
    `${htmlLine("Матрас (возраст)", labelMattressAge(answers.mattress_age))}\n` +
    `${htmlLine("Аллергия/астма", labelYesNo(answers.allergy))}\n` +
    `${htmlLine("Партнёр", labelPartner(answers.partner))}\n` +
    `${htmlLine("Жарко ночью", labelHot(answers.hot))}`;

  // менеджерам
  await sendToManagers(msg, { parse_mode: "HTML" });

  // дубль в закрытую группу контроля (TELEGRAM_CHAT_ID)
  await sendToStaffGroup(msg, { parse_mode: "HTML" });
}

/**
 * =========================
 * START handlers
 * =========================
 */
bot.start(async (ctx) => {
  const payload = (ctx.startPayload || "").trim();

  if (payload === "quiz") {
    await ctx.reply(quizIntroTextHTML(), { parse_mode: "HTML" });
    const session: QuizSession = { step: "age", answers: {} };
    quizSessionByUser.set(ctx.from!.id, session);

    const sent = await ctx.reply(quizQuestionTextHTML("age"), {
      parse_mode: "HTML",
      ...(quizKeyboard("age") as any),
    });

    session.msg = { chatId: sent.chat.id as any, messageId: sent.message_id as any };
    return;
  }

  if (payload === "support") {
    await ctx.reply(supportStartTextHTML(), { parse_mode: "HTML" });
    return;
  }

  await ctx.reply(mainMenuTextHTML(), { parse_mode: "HTML", ...mainMenuKeyboard() });
});

bot.help(async (ctx) => {
  await ctx.reply("Напишите /start чтобы открыть меню.");
});

bot.command("menu", async (ctx) => {
  await ctx.setChatMenuButton({
    text: "Каталог",
    type: "web_app",
    web_app: { url: WEB_APP_URL },
  });
  await ctx.reply(mainMenuTextHTML(), { parse_mode: "HTML", ...mainMenuKeyboard() });
});

/**
 * =========================
 * MAIN MENU buttons
 * =========================
 */
bot.action("SUPPORT_OPEN", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(supportStartTextHTML(), { parse_mode: "HTML" });
});

bot.action("QUIZ_OPEN", async (ctx) => {
  await ctx.answerCbQuery();

  const fromId = ctx.from?.id;
  if (!fromId) return;

  const session: QuizSession = { step: "age", answers: {} };
  quizSessionByUser.set(fromId, session);

  await ctx.reply(quizIntroTextHTML(), { parse_mode: "HTML" });

  const sent = await ctx.reply(quizQuestionTextHTML("age"), {
    parse_mode: "HTML",
    ...(quizKeyboard("age") as any),
  });

  session.msg = { chatId: sent.chat.id as any, messageId: sent.message_id as any };
});

bot.command("quiz", async (ctx) => {
  const fromId = ctx.from?.id;
  if (!fromId) return;

  const session: QuizSession = { step: "age", answers: {} };
  quizSessionByUser.set(fromId, session);

  await ctx.reply(quizIntroTextHTML(), { parse_mode: "HTML" });

  const sent = await ctx.reply(quizQuestionTextHTML("age"), {
    parse_mode: "HTML",
    ...(quizKeyboard("age") as any),
  });

  session.msg = { chatId: sent.chat.id as any, messageId: sent.message_id as any };
});

/**
 * =========================
 * QUIZ callback handler (красивое editMessageText)
 * callback_data: Q:<step>:<value>
 * =========================
 */
bot.action(/^Q:([^:]+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const fromId = ctx.from?.id;
  if (!fromId) return;

  const session = quizSessionByUser.get(fromId);
  if (!session) {
    await ctx.reply("Похоже, тест уже завершён. Напишите /quiz чтобы начать заново.");
    return;
  }

  const step = (ctx.match as any)[1] as QuizSession["step"];
  const value = (ctx.match as any)[2] as string;

  // защита от “устаревшей кнопки”
  if (session.step !== step) {
    await ctx.reply("Похоже, тест обновился. Напишите /quiz чтобы начать заново.");
    return;
  }

  if (step === "age") session.answers.age = value as any;
  if (step === "weight") session.answers.weight = value as any;
  if (step === "pose") session.answers.pose = value as any;
  if (step === "pain") session.answers.pain = value as any;
  if (step === "mattress_age") session.answers.mattress_age = value as any;
  if (step === "allergy") session.answers.allergy = value as any;
  if (step === "partner") session.answers.partner = value as any;
  if (step === "hot") session.answers.hot = value as any;

  const ns = nextQuizStep(step);
  session.step = ns;

  if (ns === "done_buttons") {
    const result = computeQuizResult(session.answers);
    session.lastResult = result;

    // красиво заменим последний вопрос на “готово”
    if (session.msg) {
      try {
        await bot.telegram.editMessageText(
          session.msg.chatId,
          session.msg.messageId,
          undefined,
          "✅ Тест завершён! Спасибо 🙌",
          { parse_mode: "HTML" }
        );
      } catch (e) {}
    }

    // покажем результат клиенту
    await ctx.reply(quizResultTextHTML(result), {
      parse_mode: "HTML",
      ...(afterQuizKeyboard() as any),
    });

    // собираем контакты
    session.step = "contact_name";
    await ctx.reply("👤 Напишите <b>имя</b> (обязательно):", { parse_mode: "HTML" });
    return;
  }

  // продолжаем красиво edit-ом того же сообщения
  if (session.msg) {
    try {
      await bot.telegram.editMessageText(
        session.msg.chatId,
        session.msg.messageId,
        undefined,
        quizQuestionTextHTML(ns),
        { parse_mode: "HTML", ...(quizKeyboard(ns) as any) }
      );
    } catch (e) {
      const sent = await ctx.reply(quizQuestionTextHTML(ns), {
        parse_mode: "HTML",
        ...(quizKeyboard(ns) as any),
      });
      session.msg = { chatId: sent.chat.id as any, messageId: sent.message_id as any };
    }
  } else {
    const sent = await ctx.reply(quizQuestionTextHTML(ns), {
      parse_mode: "HTML",
      ...(quizKeyboard(ns) as any),
    });
    session.msg = { chatId: sent.chat.id as any, messageId: sent.message_id as any };
  }
});

/**
 * =========================
 * TEXT handler: support + quiz contacts
 * =========================
 */
bot.on(message("text"), async (ctx) => {
  const fromId = ctx.from?.id;
  if (!fromId) return;

  const textRaw = (ctx.message.text || "").trim();
  const chatType = ctx.chat?.type;

  /**
   * 1) Менеджер отвечает клиенту (поддержка)
   */
  if (SUPPORT_MANAGERS.includes(fromId) && managerReplyMode.has(fromId)) {
    const userId = managerReplyMode.get(fromId)!;

    try {
      await bot.telegram.sendMessage(
        userId,
        `💬 <b>Ответ поддержки ErgoSpine</b>\n\n${escapeHtml(textRaw)}`,
        { parse_mode: "HTML" }
      );
      await ctx.reply("✅ Сообщение отправлено клиенту.");
    } catch (e) {
      await ctx.reply("❌ Не удалось отправить клиенту. Возможно, клиент не писал боту или заблокировал его.");
    }
    return;
  }

  /**
   * 2) Квиз — сбор контактов (только в private)
   */
  const q = quizSessionByUser.get(fromId);
  if (q && chatType === "private") {
    // Имя
    if (q.step === "contact_name") {
      if (textRaw.length < 2) {
        await ctx.reply("Имя слишком короткое. Напишите, пожалуйста, имя ещё раз:");
        return;
      }
      q.answers.contact_name = textRaw;
      q.step = "contact_phone";
      await ctx.reply("📞 Напишите <b>телефон</b> (обязательно):", { parse_mode: "HTML" });
      return;
    }

    // Телефон
    if (q.step === "contact_phone") {
      const cleaned = textRaw.replace(/[^\d+]/g, "");
      if (cleaned.length < 10) {
        await ctx.reply("Похоже, телефон неполный. Напишите номер ещё раз (например, +7 999 123-45-67):");
        return;
      }
      q.answers.contact_phone = textRaw;
      q.step = "contact_address";
      await ctx.reply("📍 Адрес доставки (по желанию). Если не хотите — отправьте просто <code>-</code>.", {
        parse_mode: "HTML",
      });
      return;
    }

    // Адрес
    if (q.step === "contact_address") {
      q.answers.contact_address = textRaw === "-" ? "" : textRaw;

      const result = q.lastResult || computeQuizResult(q.answers);

      await ctx.reply("✅ Спасибо! Данные получены.\nМенеджер свяжется с вами и поможет подобрать лучший вариант.");

      // клиенту результат ещё раз (чтобы точно было видно в конце)
      await ctx.reply(quizResultTextHTML(result), {
        parse_mode: "HTML",
        ...(afterQuizKeyboard() as any),
      });

      // менеджерам + дубль в закрытую группу
      await sendQuizLeadToManagersAndGroup(ctx.from, q.answers, result);

      // закрываем сессию
      quizSessionByUser.delete(fromId);
      return;
    }
  }

  /**
   * 3) Поддержка: private сообщения от клиента -> создаём тикет
   */
  if (chatType === "private") {
    const ticketId = ensureTicket(fromId);
    const userLabel = userLabelFrom(ctx.from);

    const msg =
      `🆘 <b>Запрос в поддержку</b>\n\n` +
      `${htmlLine("Тикет", `#${ticketId}`)}\n` +
      `${htmlLine("Клиент", userLabel)}\n` +
      `${htmlLine("ID", String(fromId))}\n\n` +
      `💬 <b>Сообщение:</b>\n${escapeHtml(textRaw)}`;

    // менеджерам
    await sendToManagers(msg, { parse_mode: "HTML", ...managerTicketKeyboard(ticketId) });

    // дубль в закрытую группу контроля
    await sendToStaffGroup(msg, { parse_mode: "HTML" });

    await ctx.reply("✅ Принято! Менеджер уже получил ваш запрос.\nЕсли нужно — добавьте детали (город, рост/вес, поза сна).");
    return;
  }
});

/**
 * =========================
 * SUPPORT ticket buttons
 * =========================
 */
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
    `✍️ Режим ответа включён.\nСледующее ваше сообщение уйдёт клиенту (тикет #${ticketId}).\n\nЧтобы отключить — отправьте /cancel или нажмите «Закрыть тикет».`,
    Markup.inlineKeyboard([[Markup.button.callback("✅ Закрыть тикет", `SUPPORT_CLOSE:${ticketId}`)]])
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
    ctx.reply("Оплата прошла успешно! ✅");
  } else {
    ctx.reply(
      `Ошибка при подтверждении оплаты. Напишите в поддержку.\n` +
        `orderId:${payload.orderId}\n` +
        `${ctx.update.message.successful_payment.telegram_payment_charge_id}\n` +
        `${ctx.update.message.successful_payment.provider_payment_charge_id}`
    );
  }
});

/**
 * =========================
 * WEBHOOK init
 * =========================
 */
export function initWebhook() {
  return bot.telegram.setWebhook(WEBHOOK_URL);
}

/**
 * Telegram payments invoice (как было)
 */
export async function createInvoiceLink(
  orderId: number,
  orderKey: string,
  currency: string,
  prices: LabeledPrice[],
  shippingZone: number
) {
  const telegramInvoice = {
    provider_token: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN!!,
    title: `Счёт заказа #${orderId}`,
    description: `Оплата заказа ${orderKey}`,
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

