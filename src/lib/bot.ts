import "dotenv/config";
import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { LabeledPrice } from "@telegraf/types";
import woo from "@/lib/woo";

export const SECRET_HASH = process.env.TELEGRAM_BOT_SECRET!;

/**
 * PUBLIC_URL — базовый домен (ОБЯЗАТЕЛЬНО для webhook)
 * Пример: https://shop.ergospine.ru
 */
const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "");

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/";

/** URL мини-приложения (каталога) */
const WEBAPP_URL = `${PUBLIC_URL}${BASE_PATH === "/" ? "" : BASE_PATH}`;

/** URL вебхука */
const WEBHOOK_URL = `${PUBLIC_URL}/api/telegram-hook?secret_hash=${SECRET_HASH}`;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
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

const SUPPORT_MANAGERS = Array.from(new Set(parseManagerIds()));

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

/** Красивое первое сообщение поддержки */
function supportStartText() {
  return (
    "🆘 *Поддержка ErgoSpine*\n\n" +
    "Напишите сюда свой вопрос — менеджер ответит вам *в этом же чате*.\n\n" +
    "Чтобы мы помогли быстрее, укажите (можно в одном сообщении):\n" +
    "1) 🛏️ что подобрать: *матрас* или *подушка*\n" +
    "2) 📏 рост/вес и 🤍 поза сна\n" +
    "3) 🧠 есть ли боли: шея/поясница\n" +
    "4) 🚚 город доставки\n\n" +
    "📎 Можно прикреплять фото/скрины/файлы.\n" +
    "⏱ Обычно отвечаем быстро."
  );
}

function quizIntroText() {
  return (
    "😴 *Тест на сон (2 минуты)*\n\n" +
    "Ответьте на 8 вопросов — и получите персональную рекомендацию.\n" +
    "В конце мы предложим подходящую модель и можно сразу перейти в каталог."
  );
}

function storeStartText() {
  return "Добро пожаловать в ErgoSpine 👋\nВыберите действие:";
}

function storeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛍️ Каталог", WEBAPP_URL)],
    [Markup.button.callback("🧪 Тест на сон", "QUIZ_START")],
    [Markup.button.callback("🆘 Поддержка", "SUPPORT_OPEN")],
  ]);
}

function supportKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✍️ Написать в поддержку", "SUPPORT_OPEN")],
    [Markup.button.callback("🧪 Пройти тест на сон", "QUIZ_START")],
    [Markup.button.webApp("🛍️ Открыть каталог", WEBAPP_URL)],
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

  if (payload === "quiz") {
    await ctx.reply(quizIntroText(), { parse_mode: "Markdown" });
    await startQuiz(ctx.from!.id, ctx);
    return;
  }

  await ctx.reply(storeStartText(), storeKeyboard());
});

bot.command("support", async (ctx) => {
  await ctx.reply(supportStartText(), { parse_mode: "Markdown", ...supportKeyboard() });
});

bot.command("quiz", async (ctx) => {
  await ctx.reply(quizIntroText(), { parse_mode: "Markdown" });
  await startQuiz(ctx.from!.id, ctx);
});

bot.action("SUPPORT_OPEN", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(supportStartText(), { parse_mode: "Markdown", ...supportKeyboard() });
});

bot.help((ctx) => ctx.reply("Напишите /start чтобы открыть меню. /support — поддержка, /quiz — тест."));

bot.command("menu", (ctx) =>
  ctx.setChatMenuButton({
    text: "Каталог",
    type: "web_app",
    web_app: { url: WEBAPP_URL },
  })
);

/** =========================
 *  SUPPORT CORE
 *  ========================= */
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
    `✍️ Режим ответа включён.\nСледующее ваше сообщение уйдёт клиенту (тикет #${ticketId}).\n\nОтмена: /cancel`,
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

/** ====== Manager -> Client (text + media) ====== */
async function forwardManagerToClient(ctx: any, userId: number) {
  const msg: any = ctx.message;

  if (msg.text) {
    await bot.telegram.sendMessage(userId, `💬 *Ответ поддержки*\n\n${msg.text}`, { parse_mode: "Markdown" });
    await ctx.reply("✅ Отправлено клиенту.");
    return;
  }

  if (msg.photo?.length) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await bot.telegram.sendPhoto(userId, fileId, { caption: "💬 Ответ поддержки" });
    await ctx.reply("✅ Фото отправлено клиенту.");
    return;
  }

  if (msg.document) {
    await bot.telegram.sendDocument(userId, msg.document.file_id, { caption: "💬 Ответ поддержки" });
    await ctx.reply("✅ Файл отправлен клиенту.");
    return;
  }

  if ("voice" in msg) {
    await bot.telegram.sendVoice(userId, msg.voice.file_id, { caption: "💬 Ответ поддержки" });
    await ctx.reply("✅ Голосовое отправлено клиенту.");
    return;
  }

  await ctx.reply("Этот тип сообщения пока не поддержан. Отправьте текст/фото/файл/голосовое.");
}

/** ====== Client -> Managers (text + media) ====== */
async function notifyManagersNewTicket(ctx: any, ticketId: number, description: string) {
  const fromId = ctx.from.id;
  const userLabel = makeUserLabel(ctx);

  const msg =
    `🆘 *Новый запрос поддержки*\n` +
    `Тикет: #${ticketId}\n` +
    `Клиент: ${userLabel}\n` +
    `ID: \`${fromId}\`\n\n` +
    `${description}`;

  await sendToManagers(msg, { parse_mode: "Markdown", ...managerTicketKeyboard(ticketId) });
}

bot.on(message(), async (ctx) => {
  const chatType = ctx.chat?.type;
  const fromId = ctx.from?.id;
  if (!fromId) return;

  // менеджер -> клиент (если включен replyMode)
  if (SUPPORT_MANAGERS.includes(fromId) && managerReplyMode.has(fromId)) {
    const userId = managerReplyMode.get(fromId)!;
    try {
      await forwardManagerToClient(ctx, userId);
    } catch (e) {
      await ctx.reply("❌ Не удалось отправить клиенту. Возможно, клиент не писал боту или заблокировал его.");
    }
    return;
  }

  // клиент -> тикет (только личка)
  if (chatType !== "private") return;

  // если клиент сейчас в квизе — обработаем ниже (квиз перехватывает текст не всегда, но тут только медиа/текст без кнопок)
  if (quizState.has(fromId)) {
    await ctx.reply("Пожалуйста, отвечайте кнопками 🙂\nЕсли хотите выйти: /cancel_quiz");
    return;
  }

  const ticketId = ensureTicket(fromId);
  const m: any = ctx.message;

  if (m.text) {
    await notifyManagersNewTicket(ctx, ticketId, `Сообщение:\n${m.text}`);
    await ctx.reply("✅ Принято! Менеджер уже получил ваш запрос.\nЕсли нужно — добавьте детали (город, рост/вес, поза сна).");
    return;
  }

  if (m.photo?.length) {
    await notifyManagersNewTicket(ctx, ticketId, "📷 Клиент прислал фото.");
    const fileId = m.photo[m.photo.length - 1].file_id;

    for (const mid of SUPPORT_MANAGERS) {
      await bot.telegram
        .sendPhoto(mid, fileId, {
          caption: `📷 Фото от клиента. Тикет #${ticketId} (ID ${fromId})`,
          ...managerTicketKeyboard(ticketId),
        })
        .catch(() => null);
    }
    await ctx.reply("✅ Фото принято! Менеджер уже получил ваш запрос.");
    return;
  }

  if (m.document) {
    await notifyManagersNewTicket(ctx, ticketId, "📎 Клиент прислал файл.");
    for (const mid of SUPPORT_MANAGERS) {
      await bot.telegram
        .sendDocument(mid, m.document.file_id, {
          caption: `📎 Файл от клиента. Тикет #${ticketId} (ID ${fromId})`,
          ...managerTicketKeyboard(ticketId),
        })
        .catch(() => null);
    }
    await ctx.reply("✅ Файл принят! Менеджер уже получил ваш запрос.");
    return;
  }

  if ("voice" in m) {
    await notifyManagersNewTicket(ctx, ticketId, "🎤 Клиент прислал голосовое.");
    for (const mid of SUPPORT_MANAGERS) {
      await bot.telegram
        .sendVoice(mid, m.voice.file_id, {
          caption: `🎤 Голосовое от клиента. Тикет #${ticketId} (ID ${fromId})`,
          ...managerTicketKeyboard(ticketId),
        })
        .catch(() => null);
    }
    await ctx.reply("✅ Голосовое принято! Менеджер уже получил ваш запрос.");
    return;
  }

  await ctx.reply("✅ Принято! Если можно — отправьте текстом, фото, файлом или голосовым.");
});

/** =========================
 *  QUIZ (Тест на сон)
 *  ========================= */
type QuizAnswers = {
  age?: string;
  weight?: string;
  pose?: string;
  pain?: string;
  mattressAge?: string;
  allergy?: string;
  partner?: string;
  hot?: string;
};

type QuizStep =
  | "age"
  | "weight"
  | "pose"
  | "pain"
  | "mattressAge"
  | "allergy"
  | "partner"
  | "hot"
  | "done";

const quizState = new Map<number, { step: QuizStep; answers: QuizAnswers }>();

function quizQuestion(step: QuizStep) {
  switch (step) {
    case "age":
      return {
        text: "1/8 👤 Сколько вам лет?",
        buttons: ["<30", "30–45", "45–60", ">60"],
      };
    case "weight":
      return {
        text: "2/8 ⚖️ Ваш вес?",
        buttons: ["<60", "60–90", "90–120", ">120"],
      };
    case "pose":
      return {
        text: "3/8 🛌 Основная поза сна?",
        buttons: ["На боку", "На спине", "На животе", "Меняю позы"],
      };
    case "pain":
      return {
        text: "4/8 🧠 Просыпаетесь с болью в спине/шее?",
        buttons: ["Да, часто", "Иногда", "Редко", "Нет"],
      };
    case "mattressAge":
      return {
        text: "5/8 ⏳ Матрасу сколько лет?",
        buttons: ["<3", "3–7", ">7", "Не знаю"],
      };
    case "allergy":
      return {
        text: "6/8 🌿 Есть аллергия/астма?",
        buttons: ["Да", "Нет"],
      };
    case "partner":
      return {
        text: "7/8 🤝 Спите один или с партнёром?",
        buttons: ["Один", "С партнёром"],
      };
    case "hot":
      return {
        text: "8/8 🔥 Жарко ли вам ночью?",
        buttons: ["Да", "Иногда", "Нет"],
      };
    default:
      return null;
  }
}

function quizKeyboard(step: QuizStep) {
  const q = quizQuestion(step);
  if (!q) return undefined;

  const rows = q.buttons.map((b) => [Markup.button.callback(b, `QUIZ_ANSWER:${step}:${encodeURIComponent(b)}`)]);
  rows.push([Markup.button.callback("⛔️ Прервать тест", "QUIZ_CANCEL")]);
  return Markup.inlineKeyboard(rows);
}

async function startQuiz(userId: number, ctxOrBot: any) {
  quizState.set(userId, { step: "age", answers: {} });
  const q = quizQuestion("age")!;
  await ctxOrBot.reply(q.text, { ...quizKeyboard("age") });
}

function nextStep(step: QuizStep): QuizStep {
  const order: QuizStep[] = ["age", "weight", "pose", "pain", "mattressAge", "allergy", "partner", "hot", "done"];
  const idx = order.indexOf(step);
  return order[Math.min(idx + 1, order.length - 1)];
}

function scoreAndRecommend(a: QuizAnswers) {
  let score = 10;

  if (a.pain === "Да, часто") score -= 3;
  else if (a.pain === "Иногда") score -= 2;
  else if (a.pain === "Редко") score -= 1;

  if (a.mattressAge === ">7") score -= 3;
  else if (a.mattressAge === "3–7") score -= 2;

  if (a.hot === "Да") score -= 1;

  score = Math.max(1, Math.min(10, score));

  // простая логика рекомендаций (позже можно усложнить)
  let model = "Spinal Duo";
  let reason = "универсальный вариант по поддержке и комфорту.";

  if (a.pose === "На боку") {
    model = "Back Stretch";
    reason = "потому что для сна на боку важна разгрузка плеча/таза и точечная поддержка.";
  } else if (a.pose === "На спине") {
    model = "Lavender Duo";
    reason = "потому что для сна на спине важна стабильная поддержка поясницы и ровная геометрия.";
  } else if (a.pain === "Да, часто") {
    model = "Spinal Duo";
    reason = "потому что при болях важен баланс поддержки и адаптации под позвоночник.";
  }

  return { score, model, reason };
}

bot.action("QUIZ_START", async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.reply(quizIntroText(), { parse_mode: "Markdown" });
  await startQuiz(userId, ctx);
});

bot.action("QUIZ_CANCEL", async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  quizState.delete(userId);
  await ctx.reply("Ок, тест остановлен 🙂\nЕсли захотите снова — /quiz", storeKeyboard());
});

bot.command("cancel_quiz", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  quizState.delete(userId);
  await ctx.reply("Ок, тест остановлен 🙂\nЕсли захотите снова — /quiz");
});

bot.action(/^QUIZ_ANSWER:([^:]+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from?.id;
  if (!userId) return;

  const step = (ctx.match as any)[1] as QuizStep;
  const val = decodeURIComponent((ctx.match as any)[2]);

 const st = quizState.get(userId);

if (!st) {
  await ctx.reply("Тест не активен. Нажмите /quiz чтобы начать заново.");
  return;
}

// Если прилетел “устаревший” клик по кнопке — просто показываем текущий вопрос
if (st.step !== step) {
  const current = quizQuestion(st.step);
  if (current) {
    await ctx.reply(
      "Поймал задержанный клик 🙂\nПродолжаем с текущего вопроса:",
      { ...quizKeyboard(st.step) }
    );
    await ctx.reply(current.text, { ...quizKeyboard(st.step) });
  } else {
    await ctx.reply("Тест уже завершён. Нажмите /quiz чтобы начать заново.");
  }
  return;
}

  // сохраняем ответ
  (st.answers as any)[step] = val;

  const ns = nextStep(step);
  if (ns === "done") {
    quizState.delete(userId);
    const { score, model, reason } = scoreAndRecommend(st.answers);

    // клиенту
    await ctx.reply(
      `✅ *Готово!*\n\nВаш “балл сна”: *${score}/10*\n\nРекомендация: *${model}* — ${reason}\n\nХотите — помогу уточнить по росту/весу и ощущениям.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.webApp("🛍️ Открыть каталог", WEBAPP_URL)],
          [Markup.button.callback("🆘 Написать в поддержку", "SUPPORT_OPEN")],
        ]),
      }
    );

    // менеджерам (лид)
    const lead =
      `🧪 *Лид из квиза “Тест на сон”*\n` +
      `Клиент: ${makeUserLabel(ctx)}\n` +
      `ID: \`${userId}\`\n` +
      `Балл: *${score}/10*\n` +
      `Рекомендация: *${model}*\n\n` +
      `Ответы:\n` +
      `Возраст: ${st.answers.age ?? "-"}\n` +
      `Вес: ${st.answers.weight ?? "-"}\n` +
      `Поза: ${st.answers.pose ?? "-"}\n` +
      `Боли: ${st.answers.pain ?? "-"}\n` +
      `Возраст матраса: ${st.answers.mattressAge ?? "-"}\n` +
      `Аллергия: ${st.answers.allergy ?? "-"}\n` +
      `Партнёр: ${st.answers.partner ?? "-"}\n` +
      `Жарко: ${st.answers.hot ?? "-"}`;

    await sendToManagers(lead, { parse_mode: "Markdown" });

    return;
  }

  // следующий вопрос
  st.step = ns;
  quizState.set(userId, st);

  const q = quizQuestion(ns)!;
  await ctx.reply(q.text, { ...quizKeyboard(ns) });
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
  const orderInfo = ctx.update.pre_checkout_query.order_info!;
  const res = await woo.updateOrderInfo(payload.orderId, orderInfo);
  if (res.status === 200) await ctx.answerPreCheckoutQuery(true);
  else await ctx.answerPreCheckoutQuery(false, "Problem occurred during update order, contact support!");
});

bot.on(message("successful_payment"), async (ctx) => {
  const payload = JSON.parse(ctx.update.message.successful_payment.invoice_payload);
  const res = await woo.setOrderPaid(payload.orderId);
  if (res.status === 200) ctx.reply("Order successfully registered!");
  else ctx.reply(`Error registering payment, contact support!\norderId:${payload.orderId}`);
});

export function initWebhook() {
  if (!PUBLIC_URL) throw new Error("PUBLIC_URL is empty. Set PUBLIC_URL=https://shop.ergospine.ru");
  if (!SECRET_HASH) throw new Error("TELEGRAM_BOT_SECRET is empty. Set TELEGRAM_BOT_SECRET in env.");
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
    provider_token: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN!,
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
