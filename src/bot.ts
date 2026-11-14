import { createHash } from "node:crypto";
import { Api, Bot, Context, GrammyError, InlineKeyboard } from "grammy";
import type { User } from "grammy/types";
import {
  Game,
  Participant,
  clearPair,
  createGame,
  getGame,
  getParticipant,
  getParticipants,
  joinGame,
  ownerGames,
  runDraw,
  setMessageId,
  setPair,
  userGameIds,
} from "./db.js";

const PAGE = 8;
const HTML = { parse_mode: "HTML" as const };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fullName = (u: User) => [u.first_name, u.last_name].filter(Boolean).join(" ");
const label = (p: Participant) => p.name + (p.username ? ` (@${p.username})` : "");
const notModified = (e: unknown) => e instanceof GrammyError && e.description.includes("not modified");

/** Секрет вебхука выводится из токена, чтобы не хранить второй секрет. */
export const webhookSecret = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------- сообщение-карточка в беседе ----------

function cardText(game: Game, parts: Participant[]): string {
  const list = parts.length
    ? parts.map((p, i) => `${i + 1}. ${esc(p.name)}`).join("\n")
    : "пока никого";
  const head = `🎅 <b>Тайный Санта</b>\nОрганизатор: ${esc(game.ownerName)}\n\n`;
  if (game.drawn) {
    return `${head}🎁 Жеребьёвка проведена! Загляните в личку с ботом.\n\nУчастники (${parts.length}):\n${list}`;
  }
  return `${head}Нажми кнопку ниже и запусти бота, чтобы участвовать.\n\nУчаствуют (${parts.length}):\n${list}`;
}

function cardKeyboard(game: Game, botUsername: string): InlineKeyboard {
  return game.drawn
    ? new InlineKeyboard().url("Открыть бота", `https://t.me/${botUsername}`)
    : new InlineKeyboard().url("🎁 Участвую", `https://t.me/${botUsername}?start=j${game.chatId}`);
}

async function refreshCard(api: Api, botUsername: string, chatId: number): Promise<void> {
  const game = await getGame(chatId);
  if (!game?.messageId) return;
  const parts = await getParticipants(chatId);
  try {
    await api.editMessageText(chatId, game.messageId, cardText(game, parts), {
      ...HTML,
      reply_markup: cardKeyboard(game, botUsername),
    });
  } catch (e) {
    if (!notModified(e)) console.error("refreshCard failed", e);
  }
}

// ---------- экраны организатора (личка) ----------

async function show(ctx: Context, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const opts = { ...HTML, reply_markup: keyboard };
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, opts);
    } catch (e) {
      if (!notModified(e)) throw e;
    }
  } else {
    await ctx.reply(text, opts);
  }
}

function pagedNames(
  items: Participant[],
  page: number,
  itemData: (p: Participant) => string,
  pageData: (page: number) => string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const cur = Math.min(Math.max(page, 0), pages - 1);
  for (const p of items.slice(cur * PAGE, cur * PAGE + PAGE)) kb.text(label(p), itemData(p)).row();
  if (pages > 1) {
    if (cur > 0) kb.text("◀", pageData(cur - 1));
    kb.text(`${cur + 1}/${pages}`, pageData(cur));
    if (cur < pages - 1) kb.text("▶", pageData(cur + 1));
    kb.row();
  }
  return kb;
}

async function pickFirst(ctx: Context, game: Game, page: number): Promise<void> {
  const free = (await getParticipants(game.chatId)).filter((p) => !p.partnerId);
  if (free.length < 2) {
    return show(ctx, "Для пары нужно минимум двое записавшихся без пары. Сейчас таких нет.");
  }
  const kb = pagedNames(free, page, (p) => `b:${game.chatId}:${p.userId}`, (n) => `a:${game.chatId}:${n}`);
  await show(ctx, `Беседа «${esc(game.title)}».\nВыбери первого человека в паре:`, kb);
}

async function pickSecond(ctx: Context, game: Game, firstId: number, page: number): Promise<void> {
  const parts = await getParticipants(game.chatId);
  const first = parts.find((p) => p.userId === firstId);
  if (!first || first.partnerId) return pickFirst(ctx, game, 0);
  const free = parts.filter((p) => !p.partnerId && p.userId !== firstId);
  const kb = pagedNames(
    free,
    page,
    (p) => `s:${game.chatId}:${firstId}:${p.userId}`,
    (n) => `b:${game.chatId}:${firstId}:${n}`,
  ).text("← Назад", `a:${game.chatId}`);
  await show(ctx, `Кто пара для <b>${esc(first.name)}</b>?`, kb);
}

async function pairsList(ctx: Context, game: Game, note = ""): Promise<void> {
  const parts = await getParticipants(game.chatId);
  const byId = new Map(parts.map((p) => [p.userId, p]));
  const pairs = parts.filter((p) => p.partnerId && p.userId < p.partnerId && byId.has(p.partnerId));
  const kb = new InlineKeyboard();
  const lines = pairs.map((p, i) => {
    const other = byId.get(p.partnerId!)!;
    kb.text(`✖ ${p.name} + ${other.name}`, `d:${game.chatId}:${p.userId}`).row();
    return `${i + 1}. ${esc(p.name)} + ${esc(other.name)}`;
  });
  kb.text("➕ Добавить пару", `a:${game.chatId}`);
  const body = lines.length
    ? `${lines.join("\n")}\n\nНажми на пару, чтобы удалить её.`
    : "Пар пока нет.";
  await show(ctx, `${note}Пары в беседе «${esc(game.title)}»:\n${body}`, kb);
}

async function drawConfirm(ctx: Context, game: Game): Promise<void> {
  const parts = await getParticipants(game.chatId);
  const pairCount = parts.filter((p) => p.partnerId).length / 2;
  const head = `Беседа «${esc(game.title)}»\nУчастников: ${parts.length}\nПар: ${pairCount}\n\n`;
  if (parts.length < 3) {
    return show(ctx, `${head}Для жеребьёвки нужно минимум трое участников.`);
  }
  const kb = new InlineKeyboard().text("🎲 Провести жеребьёвку", `g:${game.chatId}`);
  await show(ctx, `${head}После жеребьёвки записаться и изменить пары будет нельзя.`, kb);
}

async function doDraw(ctx: Context, game: Game): Promise<void> {
  const res = await runDraw(game.chatId);
  if (res.status !== "ok") {
    const reason = {
      drawn: "Жеребьёвка в этой игре уже проведена.",
      few: "Для жеребьёвки нужно минимум трое участников.",
      impossible:
        "С такими парами расклад невозможен: кому-то некому дарить. Убери часть пар (/pairs) или дождись новых участников.",
    }[res.status];
    return show(ctx, reason);
  }

  const parts = res.participants;
  const byId = new Map(parts.map((p) => [p.userId, p]));
  const failed: Participant[] = [];
  for (let i = 0; i < parts.length; i += 10) {
    await Promise.all(
      parts.slice(i, i + 10).map(async (p) => {
        try {
          await ctx.api.sendMessage(p.userId, resultText(game, byId.get(p.recipientId!)!), HTML);
        } catch (e) {
          console.error("failed to notify participant", e);
          failed.push(p);
        }
      }),
    );
  }

  let report = `Готово! Жеребьёвка в «${esc(game.title)}» проведена, участников: ${parts.length}.`;
  if (failed.length) {
    report +=
      `\n\nНе смог написать: ${failed.map((p) => esc(label(p))).join(", ")}. ` +
      "Пусть откроют бота и отправят /me.";
  }
  await show(ctx, report);

  await refreshCard(ctx.api, ctx.me.username, game.chatId);
  try {
    await ctx.api.sendMessage(
      game.chatId,
      "🎁 Жеребьёвка Тайного Санты проведена! Загляните в личку с ботом, чтобы узнать, кому вы дарите подарок.",
      { reply_markup: new InlineKeyboard().url("Открыть бота", `https://t.me/${ctx.me.username}`) },
    );
  } catch (e) {
    console.error("failed to announce in group", e);
  }
}

function resultText(game: Game, recipient: Participant): string {
  return (
    `🎅 Тайный Санта в «${esc(game.title)}»\n\n` +
    `Ты даришь подарок: <tg-spoiler>${esc(label(recipient))}</tg-spoiler>`
  );
}

// ---------- бот ----------

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  // В режиме вебхука ошибка привела бы к повторной доставке апдейта, поэтому только логируем.
  bot.use(async (_ctx, next) => {
    try {
      await next();
    } catch (e) {
      console.error("update failed", e);
    }
  });

  const group = bot.chatType(["group", "supergroup"]);
  const pm = bot.chatType("private");

  group.command("santa", async (ctx) => {
    if (ctx.from.is_bot) {
      return ctx.reply("Запусти игру от своего имени, а не как анонимный админ.");
    }
    const chatId = ctx.chat.id;
    let game = await getGame(chatId);
    if (game && game.ownerId !== ctx.from.id) {
      if (!game.drawn) {
        return ctx.reply(`Игра уже запущена, организатор — ${esc(game.ownerName)}.`, HTML);
      }
      const member = await ctx.getChatMember(ctx.from.id);
      if (member.status !== "creator" && member.status !== "administrator") {
        return ctx.reply("Новую игру может начать организатор прошлой или админ беседы.");
      }
    }
    if (!game || game.drawn) {
      game = {
        chatId,
        title: ctx.chat.title,
        ownerId: ctx.from.id,
        ownerName: fullName(ctx.from),
        messageId: null,
        drawn: false,
      };
      await createGame(game);
    }
    const parts = await getParticipants(chatId);
    const msg = await ctx.reply(cardText(game, parts), {
      ...HTML,
      reply_markup: cardKeyboard(game, ctx.me.username),
    });
    await setMessageId(chatId, msg.message_id);
  });

  group.command(["pair", "pairs", "draw", "me"], (ctx) =>
    ctx.reply("Эта команда работает в личке со мной.", {
      reply_markup: new InlineKeyboard().url("Открыть бота", `https://t.me/${ctx.me.username}`),
    }),
  );

  pm.command("start", async (ctx) => {
    const m = /^j(-?\d+)$/.exec(ctx.match.trim());
    if (!m) {
      return ctx.reply(
        "Привет! Я бот для Тайного Санты 🎅\n\n" +
          "Добавь меня в беседу и напиши там /santa — появится кнопка «Участвую».\n\n" +
          "Организатору (в личке):\n/pair — задать пару, которая не выпадет друг другу\n" +
          "/pairs — список пар\n/draw — провести жеребьёвку\n\n" +
          "Участнику:\n/me — кому я дарю подарок",
      );
    }
    const chatId = Number(m[1]);
    const { status, game } = await joinGame(chatId, {
      userId: ctx.from.id,
      name: fullName(ctx.from),
      username: ctx.from.username ?? null,
    });
    const name = esc(ctx.from.first_name);
    if (status === "none" || !game) {
      return ctx.reply("Эта игра не найдена. Попроси организатора написать /santa в беседе.");
    }
    const title = esc(game.title);
    if (status === "closed") {
      return ctx.reply(`Жеребьёвка в «${title}» уже проведена, записаться нельзя.`, HTML);
    }
    if (status === "exists") {
      return ctx.reply(`${name}, ты уже участвуешь в Тайном Санте беседы «${title}».`, HTML);
    }
    await ctx.reply(
      `Привет, ${name}! Ты участвуешь в Тайном Санте беседы «${title}» 🎅\n\n` +
        "Когда организатор проведёт жеребьёвку, я напишу сюда, кому ты даришь подарок.",
      HTML,
    );
    await refreshCard(ctx.api, ctx.me.username, chatId);
  });

  pm.command("me", async (ctx) => {
    const lines: string[] = [];
    for (const chatId of await userGameIds(ctx.from.id)) {
      const [game, me] = await Promise.all([getGame(chatId), getParticipant(chatId, ctx.from.id)]);
      if (!game || !me) continue;
      const recipient = me.recipientId ? await getParticipant(chatId, me.recipientId) : undefined;
      lines.push(
        game.drawn && recipient
          ? resultText(game, recipient)
          : `В «${esc(game.title)}» жеребьёвки ещё не было.`,
      );
    }
    await ctx.reply(lines.length ? lines.join("\n\n") : "Ты пока не участвуешь ни в одной игре.", HTML);
  });

  const ownerCommand = (action: "a" | "l" | "c", screen: (ctx: Context, game: Game) => Promise<void>) =>
    async (ctx: Context & { from: User }) => {
      const list = await ownerGames(ctx.from.id);
      if (!list.length) {
        await ctx.reply("У тебя нет активных игр. Напиши /santa в беседе, чтобы начать.");
      } else if (list.length === 1) {
        await screen(ctx, list[0]);
      } else {
        const kb = new InlineKeyboard();
        for (const g of list) kb.text(g.title, `${action}:${g.chatId}`).row();
        await ctx.reply("Для какой беседы?", { reply_markup: kb });
      }
    };

  pm.command("pair", ownerCommand("a", (ctx, game) => pickFirst(ctx, game, 0)));
  pm.command("pairs", ownerCommand("l", (ctx, game) => pairsList(ctx, game)));
  pm.command("draw", ownerCommand("c", drawConfirm));

  bot.on("callback_query:data", async (ctx) => {
    const [action, chat, x, y] = ctx.callbackQuery.data.split(":");
    const game = await getGame(Number(chat));
    if (!game || game.ownerId !== ctx.from.id) {
      return ctx.answerCallbackQuery({ text: "Это не твоя игра." });
    }
    await ctx.answerCallbackQuery();
    if (game.drawn) return show(ctx, "Жеребьёвка в этой игре уже проведена.");

    switch (action) {
      case "a":
        return pickFirst(ctx, game, Number(x ?? 0));
      case "b":
        return pickSecond(ctx, game, Number(x), Number(y ?? 0));
      case "s": {
        const ok = await setPair(game.chatId, Number(x), Number(y));
        return pairsList(ctx, game, ok ? "✅ Пара сохранена.\n\n" : "Не получилось: кто-то из них уже в паре.\n\n");
      }
      case "l":
        return pairsList(ctx, game);
      case "d":
        await clearPair(game.chatId, Number(x));
        return pairsList(ctx, game, "Пара удалена.\n\n");
      case "c":
        return drawConfirm(ctx, game);
      case "g":
        return doDraw(ctx, game);
    }
  });

  return bot;
}
