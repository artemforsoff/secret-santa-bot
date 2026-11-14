// End-to-end scenarios through the controllers: Telegram updates are fed in directly,
// Bot API calls are intercepted, data lives in memory.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Update, UserFromGetMe } from "grammy/types";
import { InMemoryGameRepository } from "../repositories/inMemoryGameRepository.js";
import { GameService } from "../services/gameService.js";
import { createBot } from "./bot.js";

const GROUP = { id: -100, type: "supergroup" as const, title: "Беседа" };
const user = (id: number) => ({ id, is_bot: false, first_name: `User${id}` });

interface Call {
  method: string;
  payload: any;
}

function setup() {
  const calls: Call[] = [];
  const bot = createBot("test-token", new GameService(new InMemoryGameRepository()));
  bot.botInfo = { id: 999, is_bot: true, first_name: "Santa", username: "santa_bot" } as UserFromGetMe;
  let messageId = 0;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    const result =
      method === "sendMessage"
        ? { message_id: ++messageId, date: 0, chat: { id: (payload as any).chat_id, type: "private" } }
        : method === "getChatMember"
          ? { status: "member", user: user(0) }
          : true;
    return { ok: true, result } as any;
  });

  let updateId = 0;
  const command = (chat: object, from: number, text: string) =>
    bot.handleUpdate({
      update_id: ++updateId,
      message: {
        message_id: 1000 + updateId,
        date: 0,
        chat,
        from: user(from),
        text,
        entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }],
      },
    } as Update);
  const inGroup = (from: number, text: string) => command(GROUP, from, text);
  const inPrivate = (from: number, text: string) =>
    command({ id: from, type: "private", first_name: `User${from}` }, from, text);
  /** A plain private message, not a command. */
  const say = (from: number, text: string) =>
    bot.handleUpdate({
      update_id: ++updateId,
      message: {
        message_id: 1000 + updateId,
        date: 0,
        chat: { id: from, type: "private", first_name: `User${from}` },
        from: user(from),
        text,
      },
    } as Update);
  const press = (from: number, data: string) =>
    bot.handleUpdate({
      update_id: ++updateId,
      callback_query: {
        id: String(updateId),
        from: user(from),
        chat_instance: "x",
        data,
        message: { message_id: 500, date: 0, chat: { id: from, type: "private", first_name: "x" }, text: "x" },
      },
    } as Update);

  /** Bot API calls made during the action. */
  const during = async (action: () => Promise<unknown>): Promise<Call[]> => {
    const from = calls.length;
    await action();
    return calls.slice(from);
  };
  const buttons = (call: Call): string[] =>
    (call.payload.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.callback_data ?? b.url);

  return { inGroup, inPrivate, say, press, during, buttons };
}

test("full scenario: game, joining, pairs, draw, /me", async () => {
  const { inGroup, inPrivate, press, during, buttons } = setup();

  // /santa in the group: a card with a join link button
  const [card] = await during(() => inGroup(1, "/santa"));
  assert.equal(card.method, "sendMessage");
  assert.equal(card.payload.chat_id, GROUP.id);
  assert.deepEqual(buttons(card), ["https://t.me/santa_bot?start=j-100"]);

  // joining: a private reply and a refreshed card in the group
  for (const id of [1, 2, 3, 4]) {
    const [reply, edit] = await during(() => inPrivate(id, "/start j-100"));
    assert.match(reply.payload.text, new RegExp(`Привет, User${id}! Ты участвуешь`));
    assert.equal(edit.method, "editMessageText");
    assert.equal(edit.payload.chat_id, GROUP.id);
    assert.match(edit.payload.text, new RegExp(`Участвуют \\(${id}\\)`));
  }
  const [again] = await during(() => inPrivate(2, "/start j-100"));
  assert.match(again.payload.text, /уже участвуешь/);

  // a non-organizer cannot manage the game
  const [denied] = await during(() => press(2, "g:-100"));
  assert.equal(denied.method, "answerCallbackQuery");
  assert.equal(denied.payload.text, "Это не твоя игра.");
  const [noGames] = await during(() => inPrivate(2, "/draw"));
  assert.match(noGames.payload.text, /нет активных игр/);

  // pair 1 + 2 via buttons
  const [pickFirst] = await during(() => inPrivate(1, "/pair"));
  assert.deepEqual(buttons(pickFirst), ["b:-100:1:0", "b:-100:2:0", "b:-100:3:0", "b:-100:4:0"]);
  const pickSecond = (await during(() => press(1, "b:-100:1:0"))).at(-1)!;
  assert.deepEqual(buttons(pickSecond), ["s:-100:1:2", "s:-100:1:3", "s:-100:1:4", "a:-100:0"]);
  const saved = (await during(() => press(1, "s:-100:1:2"))).at(-1)!;
  assert.match(saved.payload.text, /Пара сохранена/);
  assert.match(saved.payload.text, /1\. User1 \+ User2/);

  // a second pair, then its removal; old-format buttons without a page number still work
  await press(1, "s:-100:3:4");
  const removed = (await during(() => press(1, "d:-100:3"))).at(-1)!;
  assert.match(removed.payload.text, /Пара удалена/);
  assert.doesNotMatch(removed.payload.text, /User3 \+ User4/);
  const oldFormat = (await during(() => press(1, "a:-100"))).at(-1)!;
  assert.deepEqual(buttons(oldFormat), ["b:-100:3:0", "b:-100:4:0"]);

  // the draw
  const [confirm] = await during(() => inPrivate(1, "/draw"));
  assert.match(confirm.payload.text, /Участников: 4\nПар: 1/);
  assert.deepEqual(buttons(confirm), ["g:-100"]);

  const drawCalls = await during(() => press(1, "g:-100"));
  const results = drawCalls.filter((c) => c.method === "sendMessage" && c.payload.chat_id > 0);
  assert.deepEqual(results.map((c) => c.payload.chat_id).sort(), [1, 2, 3, 4]);
  for (const r of results) assert.match(r.payload.text, /Ты даришь подарок: <tg-spoiler>User\d<\/tg-spoiler>/);
  const toUser1 = results.find((c) => c.payload.chat_id === 1)!.payload.text as string;
  assert.doesNotMatch(toUser1, /User[12]</, "neither themselves nor their partner");
  assert.ok(drawCalls.some((c) => c.method === "editMessageText" && /участников: 4/.test(c.payload.text)));
  assert.ok(
    drawCalls.some(
      (c) => c.method === "editMessageText" && c.payload.chat_id === GROUP.id && /Жеребьёвка проведена/.test(c.payload.text),
    ),
  );
  assert.ok(
    drawCalls.some((c) => c.method === "sendMessage" && c.payload.chat_id === GROUP.id),
    "announcement in the group",
  );

  // after the draw: /me repeats the result, joining and managing are closed
  const [me] = await during(() => inPrivate(1, "/me"));
  assert.equal(me.payload.text, toUser1);
  const [closed] = await during(() => inPrivate(5, "/start j-100"));
  assert.match(closed.payload.text, /уже проведена, записаться нельзя/);
  const second = (await during(() => press(1, "g:-100"))).at(-1)!;
  assert.match(second.payload.text, /уже проведена/);
});

test("the organizer removes a participant via /remove", async () => {
  const { inGroup, inPrivate, press, during, buttons } = setup();
  await inGroup(1, "/santa");
  for (const id of [1, 2, 3, 4]) await inPrivate(id, "/start j-100");
  await press(1, "s:-100:2:3");

  const [list] = await during(() => inPrivate(1, "/remove"));
  assert.deepEqual(buttons(list), ["k:-100:1", "k:-100:2", "k:-100:3", "k:-100:4"]);

  const confirm = (await during(() => press(1, "k:-100:2"))).at(-1)!;
  assert.match(confirm.payload.text, /Убрать <b>User2<\/b>/);
  assert.match(confirm.payload.text, /Пара с этим участником будет расформирована/);
  assert.deepEqual(buttons(confirm), ["x:-100:2", "r:-100:0"]);

  // a non-organizer cannot press the button
  const [denied] = await during(() => press(3, "x:-100:2"));
  assert.equal(denied.payload.text, "Это не твоя игра.");

  const calls = await during(() => press(1, "x:-100:2"));
  const screen = calls.find((c) => c.method === "editMessageText" && c.payload.chat_id !== GROUP.id)!;
  assert.match(screen.payload.text, /User2 больше не участвует/);
  assert.deepEqual(buttons(screen), ["k:-100:1", "k:-100:3", "k:-100:4"]);
  const card = calls.find((c) => c.method === "editMessageText" && c.payload.chat_id === GROUP.id)!;
  assert.match(card.payload.text, /Участвуют \(3\)/);
  assert.doesNotMatch(card.payload.text, /User2/);
  const notice = calls.find((c) => c.method === "sendMessage")!;
  assert.equal(notice.payload.chat_id, 2);
  assert.match(notice.payload.text, /убрал тебя/);

  // the removed person's pair is dissolved, and they can join again
  const pairs = (await during(() => press(1, "l:-100"))).at(-1)!;
  assert.match(pairs.payload.text, /Пар пока нет/);
  const [rejoin] = await during(() => inPrivate(2, "/start j-100"));
  assert.match(rejoin.payload.text, /Ты участвуешь/);
});

test("repeated /santa and /list: every card is refreshed, not only the latest", async () => {
  const { inGroup, inPrivate, press, during, buttons } = setup();
  const [empty] = await during(() => inGroup(2, "/list"));
  assert.match(empty.payload.text, /игра ещё не запущена/);

  await inGroup(1, "/santa"); // card 1
  await inPrivate(1, "/start j-100");
  await inGroup(1, "/santa"); // card 2, same game

  // /list is available to any group member and posts card 3
  const listCalls = await during(() => inGroup(2, "/list"));
  const posted = listCalls.at(-1)!;
  assert.equal(posted.method, "sendMessage");
  assert.match(posted.payload.text, /Участвуют \(1\)/);
  assert.deepEqual(buttons(posted), ["https://t.me/santa_bot?start=j-100"]);

  const editedCards = (calls: { method: string; payload: any }[]) =>
    calls
      .filter((c) => c.method === "editMessageText" && c.payload.chat_id === GROUP.id)
      .map((c) => c.payload.message_id)
      .sort((a, b) => a - b);

  // a new participant joining refreshes all three cards
  const joinCalls = await during(() => inPrivate(2, "/start j-100"));
  const cards = editedCards(joinCalls);
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards).size, 3);
  for (const c of joinCalls.filter((c) => c.method === "editMessageText")) {
    assert.match(c.payload.text, /Участвуют \(2\)/);
  }

  // so does removing a participant
  await inPrivate(3, "/start j-100");
  const removeCalls = await during(() => press(1, "x:-100:3"));
  assert.deepEqual(editedCards(removeCalls), cards);
});

test("wishlist: write, update, the Santa sees it in the draw message and in /me", async () => {
  const { inGroup, inPrivate, say, press, during } = setup();

  // a plain message without /wishlist is ignored
  assert.deepEqual(await during(() => say(2, "просто текст")), []);

  // /wishlist → the bot waits for text → the next message is saved
  const [prompt] = await during(() => inPrivate(2, "/wishlist"));
  assert.match(prompt.payload.text, /Напиши одним сообщением/);
  const [saved] = await during(() => say(2, "Носки <тёплые> & чай"));
  assert.match(saved.payload.text, /Вишлист сохранён/);
  assert.match(saved.payload.text, /<blockquote>Носки &lt;тёплые&gt; &amp; чай<\/blockquote>/);
  // after saving, the bot no longer waits for text
  assert.deepEqual(await during(() => say(2, "ещё текст")), []);

  // a repeated /wishlist shows the current one and replaces it
  const [again] = await during(() => inPrivate(2, "/wishlist"));
  assert.match(again.payload.text, /Твой вишлист сейчас:\n<blockquote>Носки/);
  // a command sent while waiting is not saved as the wishlist
  const [me] = await during(() => inPrivate(2, "/me"));
  assert.match(me.payload.text, /не участвуешь/);
  const [replaced] = await during(() => say(2, "Книга"));
  assert.match(replaced.payload.text, /<blockquote>Книга<\/blockquote>/);

  // text that is too long is rejected and the bot keeps waiting
  await inPrivate(3, "/wishlist");
  const [tooLong] = await during(() => say(3, "я".repeat(1001)));
  assert.match(tooLong.payload.text, /максимум 1000 символов/);
  const [ok] = await during(() => say(3, "Плед"));
  assert.match(ok.payload.text, /<blockquote>Плед<\/blockquote>/);

  // /wishlist with text saves right away
  const [inline] = await during(() => inPrivate(1, "/wishlist Кофе"));
  assert.match(inline.payload.text, /<blockquote>Кофе<\/blockquote>/);

  // the draw: everyone receives their recipient's wishlist
  await inGroup(1, "/santa");
  for (const id of [1, 2, 3, 4]) await inPrivate(id, "/start j-100");
  const wishes: Record<string, string> = { User1: "Кофе", User2: "Книга", User3: "Плед" };
  const drawCalls = await during(() => press(1, "g:-100"));
  const results = drawCalls.filter((c) => c.method === "sendMessage" && c.payload.chat_id > 0);
  assert.equal(results.length, 4);
  const recipientOf = (text: string) => /<tg-spoiler>(User\d)<\/tg-spoiler>/.exec(text)![1];
  for (const r of results) {
    const wish = wishes[recipientOf(r.payload.text)];
    if (wish) assert.match(r.payload.text, new RegExp(`Вишлист:\\n<blockquote>${wish}</blockquote>`));
    else assert.match(r.payload.text, /Вишлиста пока нет/);
  }

  // the recipient updated the wishlist after the draw: their Santa sees the new one in /me
  const santaOf4 = results.find((r) => recipientOf(r.payload.text) === "User4")!.payload.chat_id;
  await inPrivate(4, "/wishlist Наушники");
  const [after] = await during(() => inPrivate(santaOf4, "/me"));
  assert.match(after.payload.text, /<tg-spoiler>User4<\/tg-spoiler>\n\n🎁 Вишлист:\n<blockquote>Наушники<\/blockquote>/);
});

test("/start without a parameter and organizer commands in the group", async () => {
  const { inGroup, inPrivate, during } = setup();
  const [help] = await during(() => inPrivate(1, "/start"));
  assert.match(help.payload.text, /бот для Тайного Санты/);
  const [redirect] = await during(() => inGroup(1, "/draw"));
  assert.match(redirect.payload.text, /в личке/);
  const [unknown] = await during(() => inPrivate(1, "/start j-777"));
  assert.match(unknown.payload.text, /не найдена/);
});
