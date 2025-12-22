import "dotenv/config";
import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { LabeledPrice } from "@telegraf/types";
import woo from "@/lib/woo";

/**
 * ============================================================
 * ENV
 * ============================================================
 */
export const SECRET_HASH = process.env.TELEGRAM_BOT_SECRET!!;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!!;

/**
 * ВАЖНО:
 * Telegram web_app кнопка принимает ТОЛЬКО абсолютный https URL.
 * Поэтому НЕ используем NEXT_PUBLIC_BASE_PATH как URL.
 */
const WEBAPP_URL =
  (process.env.TELEGRAM_WEBAPP_URL || "").trim() || "https://shop.ergospine.ru/";

/**
 * ВАЖНО:
 * Webhook тоже должен быть абсолютным.
 * Пример: https://shop.ergospine.ru/api/telegram-hook?secret_hash=...
 */
const WEBHOOK_BASE_URL =
  (process.env.TELEGRAM_WEBHOOK_BASE_URL || "").trim() || "https://shop.ergospine.ru";

const WEBHOOK_URL = `${WEBHOOK_BASE_URL}/api/telegram-hook?secret_hash=${SECRET_HASH}`;

const bot = new Telegraf(BOT_TOKEN);

/**
 * ============================================================
 * SUPPORT MANAGERS
 * ============================================================
 */
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
 * ============================================================
 * HELPERS (safe)
 * ============================================================
 */
async function safeAnswerCbQuery(ctx: any, text?: string) {
  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Игнорируем, чтобы не ловить "query is too old..."
  }
}

function makeUserLabel(ctx: any) {
  const u = ctx.from;
  const full = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  const username = u?.username ? `@${u.username}` : "";
  return `${full || "Пользователь"} ${username}`.trim();
}

async function sendToManagers(text: string, extra?: any) {
  if (!SUPPORT_MANAGERS.length) {
    console.log("No SUPPORT_MANAGERS configured");
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

/**
 * ============================================================
 * UI TEXTS / KEYBOARDS
 * ============================================================
 */
function mainMenuText() {
  return (
    "👋 *ErgoSpine*\n\n" +
    "Выберите, что вам нужно:\n" +
    "🛍️ Каталог — товары и оформление заказа\n" +
    "🆘 Поддержка — вопрос менеджеру\n" +
    "😴 Тест на сон — персональная рекомендация за 2 минуты"
  );
}

function supportStartText() {
  return (
    "🆘 *Поддержка ErgoSpine*\n\n" +
    "Напишите сюда свой вопрос — менеджер ответит вам *в этом чате*.\n\n" +
    "Чтобы мы помогли быстрее, отправьте:\n" +
    "1) что подбираем (матрас / подушку)\n" +
    "2) рост/вес, поза сна\n" +
    "3) есть ли боли (шея/поясница)\n" +
    "4) город доставки\n\n" +
    "📎 Можно прикреплять фото/скрины.\n" +
    "⏱ Обычно отвечаем быстро."
  );
}

function quizIntroText() {
  return (
    "😴 *Тест на сон за 2 минуты*\n\n" +
    "Ответьте на 8 коротких вопросов — и я дам *персональную рекомендацию*.\n\n" +
    "В конце можно оставить контакт — менеджер поможет выбрать идеальный вариант."
  );
}

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Каталог", WEBAPP_URL)],
    [Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN")],
    [Markup.button.callback("😴 Тест на сон", "QUIZ_START")],
  ]);
}

function supportKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✍️ Написать в поддержку", "SUPPORT_OPEN")],
    [Markup.button.webApp("🛍️ Открыть каталог", WEBAPP_URL)],
    [Markup.button.callback("😴 Пройти тест на сон", "QUIZ_START")],
  ]);
}

/**
 * ============================================================
 * SUPPORT CORE (tickets + reply-mode)
 * ============================================================
 *
 * Простая in-memory маршрутизация:
 * - ticketByUser: userId -> ticketId
 * - ticketToUser: ticketId -> userId
 * - managerReplyMode: managerId -> userId (кому сейчас отвечает)
 *
 * Важно: после рестарта PM2 всё сбросится (для MVP норм).
 */
let ticketSeq = 1000;
const ticketByUser = new Map<number, number>();
const ticketToUser = new Map<number, number>();
const managerReplyMode = new Map<number, number>();

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
    [Markup.button.callback("✅ Закрыть", `SUPPORT_CLOSE:${ticketId}`)],
  ]);
}

bot.action("SUPPORT_OPEN", async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await ctx.reply(supportStartText(), { parse_mode: "Markdown", ...supportKeyboard() });
});

bot.action(/^SUPPORT_REPLY:(\d+)$/, async (ctx) => {
  await safeAnswerCbQuery(ctx);

  const managerId = ctx.from?.id;
  const ticketId = Number((ctx.match as any)[1]);
  const userId = ticketToUser.get(ticketId);

  if (!managerId || !userId) {
    await ctx.reply("Не могу найти пользователя этого тикета.");
    return;
  }

  managerReplyMode.set(managerId, userId);

  await ctx.reply(
    `✍️ *Режим ответа включён*\nСледующее ваше сообщение уйдёт клиенту (тикет #${ticketId}).\n\nОтмена: /cancel`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard([Markup.button.callback("✅ Закрыть", `SUPPORT_CLOSE:${ticketId}`)]) }
  );
});

bot.action(/^SUPPORT_CLOSE:(\d+)$/, async (ctx) => {
  await safeAnswerCbQuery(ctx);

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
 * ============================================================
 * QUIZ (lead gen)
 * ============================================================
 */

type QuizStep =
  | "age"
  | "weight"
  | "pose"
  | "pain"
  | "mattress_age"
  | "allergy"
  | "partner"
  | "hot"
  | "contact";

type QuizState = {
  step: QuizStep;
  answers: Record<string, string>;
  startedAt: number;
};

const quizByUser = new Map<number, QuizState>();

function quizReset(userId: number) {
  quizByUser.delete(userId);
}

function quizSet(userId: number, st: QuizState) {
  quizByUser.set(userId, st);
}

function quizGet(userId: number) {
  return quizByUser.get(userId);
}

function quizStartFor(userId: number) {
  const st: QuizState = { step: "age", answers: {}, startedAt: Date.now() };
  quizSet(userId, st);
  return st;
}

/**
 * callback_data формат:
 * QZ:<step>:<value>
 */
function qz(step: string, value: string) {
  return `QZ:${step}:${encodeURIComponent(value)}`;
}

function quizKeyboardForStep(step: QuizStep) {
  if (step === "age") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("до 30", qz("age", "<30")), Markup.button.callback("30–45", qz("age", "30-45"))],
      [Markup.button.callback("45–60", qz("age", "45-60")), Markup.button.callback("60+", qz("age", ">60"))],
      [Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")],
    ]);
  }

  if (step === "weight") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("до 60 кг", qz("weight", "<60")), Markup.button.callback("60–90", qz("weight", "60-90"))],
      [Markup.button.callback("90–120", qz("weight", "90-120")), Markup.button.callback("120+", qz("weight", ">120"))],
      [Markup.button.callback("⬅️ Назад", "QUIZ_BACK"), Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")],
    ]);
  }

  if (step === "pose") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("На боку", qz("pose", "side")), Markup.button.callback("На спине", qz("pose", "back"))],
      [Markup.button.callback("На животе", qz("pose", "stomach")), Markup.button.callback("Меняю позы", qz("pose", "mixed"))],
      [Markup.button.callback("⬅️ Назад", "QUIZ_BACK"), Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")],
    ]);
  }

  if (step === "pain") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Да, часто", qz("pain", "often")), Markup.button.callback("Иногда", qz("pain", "sometimes"))],
      [Markup.button.callback("Редко", qz("pain", "rarely")), Markup.button.callback("Нет", qz("pain", "no"))],
      [Markup.button.callback("⬅️ Назад", "QUIZ_BACK"), Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")],
    ]);
  }

  if (step === "mattress_age") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("До 3 лет", qz("mattress_age", "<3")), Markup.button.callback("3–7", qz("mattress_age", "3-7"))],
      [Markup.button.callback("Больше 7", qz("mattress_age", ">7")), Markup.button.callback("Не знаю", qz("mattress_age", "unknown"))],
      [Markup.button.callback("⬅️ Назад", "QUIZ_BACK"), Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")],
    ]);
  }

  if (step === "allergy") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Да", qz("allergy", "yes")), Markup.button.callback("Нет", qz("allergy", "no"))],
      [Markup.button.callback("⬅️ Назад", "QUIZ_BACK"), Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")],
    ]);
  }

  if (step === "partner") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Один(одна)", qz("partner", "solo")), Markup.button.callback("С партнёром", qz("partner", "with_partner"))],
      [Markup.button.callback("⬅️ Назад", "QUIZ_BACK"), Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")],
    ]);
  }

  if (step === "hot") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Да", qz("hot", "yes")), Markup.button.callback("Иногда", qz("hot", "sometimes")), Markup.button.callback("Нет", qz("hot", "no"))],
      [Markup.button.callback("⬅️ Назад", "QUIZ_BACK"), Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")],
    ]);
  }

  if (step === "contact") {
    return Markup.inlineKeyboard([
      [Markup.button.callback("Оставить контакт менеджеру", "QUIZ_LEAVE_CONTACT")],
      [Markup.button.callback("🛍️ Открыть каталог", "QUIZ_OPEN_CATALOG")],
      [Markup.button.callback("🆘 В поддержку", "SUPPORT_OPEN")],
    ]);
  }

  return Markup.inlineKeyboard([[Markup.button.callback("❌ Отмена", "QUIZ_CANCEL")]]);
}

function quizQuestionText(step: QuizStep) {
  const total = 8;
  if (step === "age") return `1/${total} 🎂 Ваш возраст?`;
  if (step === "weight") return `2/${total} ⚖️ Ваш вес?`;
  if (step === "pose") return `3/${total} 🛏️ Основная поза сна?`;
  if (step === "pain") return `4/${total} 🧠 Просыпаетесь с болью в спине/шее?`;
  if (step === "mattress_age") return `5/${total} 🕰️ Сколько лет вашему матрасу?`;
  if (step === "allergy") return `6/${total} 🌿 Есть аллергия/астма?`;
  if (step === "partner") return `7/${total} 👥 Спите один или с партнёром?`;
  if (step === "hot") return `8/${total} 🔥 Жарко ли вам ночью?`;
  if (step === "contact") return `✅ Готово!`;
  return "Вопрос";
}

function quizNextStep(current: QuizStep): QuizStep {
  if (current === "age") return "weight";
  if (current === "weight") return "pose";
  if (current === "pose") return "pain";
  if (current === "pain") return "mattress_age";
  if (current === "mattress_age") return "allergy";
  if (current === "allergy") return "partner";
  if (current === "partner") return "hot";
  if (current === "hot") return "contact";
  return "contact";
}

function quizPrevStep(current: QuizStep): QuizStep {
  if (current === "weight") return "age";
  if (current === "pose") return "weight";
  if (current === "pain") return "pose";
  if (current === "mattress_age") return "pain";
  if (current === "allergy") return "mattress_age";
  if (current === "partner") return "allergy";
  if (current === "hot") return "partner";
  return "age";
}

function computeScore(a: Record<string, string>): number {
  // Простой скоринг 0..10
  let score = 10;

  // боль
  if (a.pain === "often") score -= 3;
  if (a.pain === "sometimes") score -= 2;
  if (a.pain === "rarely") score -= 1;

  // возраст матраса
  if (a.mattress_age === ">7") score -= 3;
  if (a.mattress_age === "3-7") score -= 2;
  if (a.mattress_age === "unknown") score -= 1;

  // поза
  if (a.pose === "stomach") score -= 2; // на животе чаще проблемы
  if (a.pose === "mixed") score -= 1;

  // жарко
  if (a.hot === "yes") score -= 1;

  // вес
  if (a.weight === ">120") score -= 2;
  if (a.weight === "90-120") score -= 1;

  if (score < 0) score = 0;
  if (score > 10) score = 10;
  return score;
}

function pickRecommendation(a: Record<string, string>) {
  // Условная логика — потом можно уточнить под ваши линейки
  if (a.pose === "side") return { model: "Back Stretch", reason: "для сна на боку и разгрузки плеч/таза" };
  if (a.pose === "back") return { model: "Lavender Duo", reason: "для сна на спине и поддержки поясницы" };
  return { model: "Spinal Duo", reason: "универсальный вариант под разные позы" };
}

function resultText(a: Record<string, string>) {
  const score = computeScore(a);
  const rec = pickRecommendation(a);

  return (
    `🏁 *Ваш результат*\n\n` +
    `Ваш балл по сну: *${score}/10*\n\n` +
    `✨ Рекомендация: *${rec.model}*\n` +
    `Почему: ${rec.reason}.\n\n` +
    `Хотите — менеджер уточнит детали и подберёт идеальную комплектацию под ваши параметры.`
  );
}

async function quizSendStep(ctx: any, userId: number, step: QuizStep, editIfPossible = true) {
  const text = quizQuestionText(step);
  const kb = quizKeyboardForStep(step);

  // Пытаемся редактировать сообщение с кнопками (чтобы не плодить чат)
  if (editIfPossible && ctx.update?.callback_query?.message) {
    try {
      await ctx.editMessageText(text, { ...kb });
      return;
    } catch {
      // если редактирование не удалось — просто отправим новое
    }
  }

  await ctx.reply(text, { ...kb });
}

/**
 * Запуск квиза
 */
async function quizBegin(ctx: any) {
  const userId = ctx.from?.id;
  if (!userId) return;

  quizStartFor(userId);

  await ctx.reply(quizIntroText(), { parse_mode: "Markdown" });
  await quizSendStep(ctx, userId, "age", false);
}

bot.command("quiz", async (ctx) => {
  await quizBegin(ctx);
});

bot.action("QUIZ_START", async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await quizBegin(ctx);
});

bot.action("QUIZ_CANCEL", async (ctx) => {
  await safeAnswerCbQuery(ctx);
  const userId = ctx.from?.id;
  if (userId) quizReset(userId);

  // Стараемся убрать клавиатуру/обновить сообщение
  try {
    await ctx.editMessageText("Ок, тест отменён. Можете начать заново: /quiz", {
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    await ctx.reply("Ок, тест отменён. Можете начать заново: /quiz");
  }

  await ctx.reply(mainMenuText(), { parse_mode: "Markdown", ...mainMenuKeyboard() });
});

bot.action("QUIZ_BACK", async (ctx) => {
  await safeAnswerCbQuery(ctx);

  const userId = ctx.from?.id;
  if (!userId) return;

  const st = quizGet(userId);
  if (!st) {
    await ctx.reply("Похоже тест сбросился. Нажмите /quiz чтобы начать заново.");
    return;
  }

  const prev = quizPrevStep(st.step);
  st.step = prev;
  quizSet(userId, st);

  await quizSendStep(ctx, userId, prev, true);
});

/**
 * Ответы на вопросы квиза
 */
bot.action(/^QZ:([^:]+):(.+)$/, async (ctx) => {
  await safeAnswerCbQuery(ctx);

  const userId = ctx.from?.id;
  if (!userId) return;

  const st = quizGet(userId);
  if (!st) {
    await ctx.reply("Похоже тест сбросился. Нажмите /quiz чтобы начать заново.");
    return;
  }

  const step = String((ctx.match as any)[1] || "").trim();
  const value = decodeURIComponent(String((ctx.match as any)[2] || "").trim());

  // Защита: принимаем ответ только для текущего шага
  if (step !== st.step) {
    await ctx.reply("Похоже вы нажали кнопку от старого вопроса. Нажмите /quiz чтобы начать заново.");
    return;
  }

  st.answers[step] = value;

  const next = quizNextStep(st.step);
  st.step = next;
  quizSet(userId, st);

  if (next === "contact") {
    const txt = resultText(st.answers);

    // Отправляем итог пользователю
    try {
      await ctx.editMessageText(txt, { parse_mode: "Markdown", ...quizKeyboardForStep("contact") });
    } catch {
      await ctx.reply(txt, { parse_mode: "Markdown", ...quizKeyboardForStep("contact") });
    }

    // Отправляем лида менеджерам
    const userLabel = makeUserLabel(ctx);
    const leadMsg =
      `😴 *Лид из квиза “Тест на сон”*\n` +
      `Клиент: ${userLabel}\n` +
      `ID: \`${userId}\`\n\n` +
      `Ответы:\n` +
      `• Возраст: ${st.answers.age || "-"}\n` +
      `• Вес: ${st.answers.weight || "-"}\n` +
      `• Поза: ${st.answers.pose || "-"}\n` +
      `• Боль: ${st.answers.pain || "-"}\n` +
      `• Матрас: ${st.answers.mattress_age || "-"}\n` +
      `• Аллергия: ${st.answers.allergy || "-"}\n` +
      `• Партнёр: ${st.answers.partner || "-"}\n` +
      `• Жарко: ${st.answers.hot || "-"}\n`;

    await sendToManagers(leadMsg, { parse_mode: "Markdown" });

    return;
  }

  // Переходим к следующему шагу
  await quizSendStep(ctx, userId, next, true);
});

bot.action("QUIZ_OPEN_CATALOG", async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await ctx.reply("Открываю каталог 👇", Markup.inlineKeyboard([[Markup.button.webApp("🛍️ Каталог", WEBAPP_URL)]]));
});

bot.action("QUIZ_LEAVE_CONTACT", async (ctx) => {
  await safeAnswerCbQuery(ctx);
  await ctx.reply(
    "✍️ Напишите в одном сообщении ваш телефон (или удобный способ связи) и город доставки.\n\nПример:\n+7 999 123-45-67, Краснодар"
  );

  // После этого обычный текст улетит в поддержку как тикет (ниже в обработчике message("text"))
});

/**
 * ============================================================
 * START / MENU
 * ============================================================
 */
bot.start(async (ctx) => {
  const payload = (ctx.startPayload || "").trim();

  // /start support
  if (payload === "support") {
    await ctx.reply(supportStartText(), { parse_mode: "Markdown", ...supportKeyboard() });
    return;
  }

  // /start quiz
  if (payload === "quiz") {
    await quizBegin(ctx);
    return;
  }

  // дефолт
  await ctx.reply(mainMenuText(), { parse_mode: "Markdown", ...mainMenuKeyboard() });
});

bot.help((ctx) => ctx.reply("Команды: /start /quiz /cancel"));

bot.command("menu", (ctx) =>
  ctx.setChatMenuButton({
    text: "Каталог",
    type: "web_app",
    web_app: { url: WEBAPP_URL },
  })
);

/**
 * ============================================================
 * MESSAGES ROUTING:
 * - manager in replyMode -> send to client
 * - user private -> support ticket
 * ============================================================
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
      await bot.telegram.sendMessage(userId, `💬 *Ответ поддержки*\n\n${text}`, {
        parse_mode: "Markdown",
      });
      await ctx.reply("✅ Отправлено клиенту.");
    } catch (e) {
      await ctx.reply("❌ Не удалось отправить клиенту. Возможно, клиент не писал боту или заблокировал его.");
    }
    return;
  }

  // Только private для клиентов
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

/**
 * ============================================================
 * EXISTING: shipping/payment (оставлено как было)
 * ============================================================
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
 * ============================================================
 * WEBHOOK INIT
 * ============================================================
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

