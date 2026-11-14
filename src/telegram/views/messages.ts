import type { Game, Participant } from "../../domain/types.js";
import type { DrawFailure } from "../../services/gameService.js";
import { esc, label } from "./format.js";

export const messages = {
  help:
    "Привет! Я бот для Тайного Санты 🎅\n\n" +
    "Добавь меня в беседу и напиши там /santa — появится кнопка «Участвую».\n" +
    "/list в беседе покажет актуальный список участников.\n\n" +
    "Организатору (в личке):\n/pair — задать пару, которая не выпадет друг другу\n" +
    "/pairs — список пар\n/remove — убрать участника\n/draw — провести жеребьёвку\n\n" +
    "Участнику:\n/wishlist — написать или обновить свой вишлист\n" +
    "/me — кому я дарю подарок и его вишлист",

  // ----- group -----
  anonymousAdmin: "Запусти игру от своего имени, а не как анонимный админ.",
  gameOwnedBy: (game: Game) => `Игра уже запущена, организатор — ${esc(game.ownerName)}.`,
  restartNotAllowed: "Новую игру может начать организатор прошлой или админ беседы.",
  privateOnly: "Эта команда работает в личке со мной.",
  noGameInChat: "В этой беседе игра ещё не запущена. Напиши /santa, чтобы начать.",
  drawAnnouncement:
    "🎁 Жеребьёвка Тайного Санты проведена! Загляните в личку с ботом, чтобы узнать, кому вы дарите подарок.",

  // ----- participant -----
  gameNotFound: "Эта игра не найдена. Попроси организатора написать /santa в беседе.",
  joinClosed: (game: Game) => `Жеребьёвка в «${esc(game.title)}» уже проведена, записаться нельзя.`,
  alreadyJoined: (firstName: string, game: Game) =>
    `${esc(firstName)}, ты уже участвуешь в Тайном Санте беседы «${esc(game.title)}».`,
  joined: (firstName: string, game: Game) =>
    `Привет, ${esc(firstName)}! Ты участвуешь в Тайном Санте беседы «${esc(game.title)}» 🎅\n\n` +
    "Когда организатор проведёт жеребьёвку, я напишу сюда, кому ты даришь подарок.",
  result: (game: Game, recipient: Participant, wishlist: string | null) =>
    `🎅 Тайный Санта в «${esc(game.title)}»\n\n` +
    `Ты даришь подарок: <tg-spoiler>${esc(label(recipient))}</tg-spoiler>\n\n` +
    (wishlist
      ? `🎁 Вишлист:\n<blockquote>${esc(wishlist)}</blockquote>`
      : "Вишлиста пока нет. Загляни в /me позже — вдруг появится."),

  // ----- wishlist -----
  wishlistPrompt: (current: string | null) =>
    current
      ? `Твой вишлист сейчас:\n<blockquote>${esc(current)}</blockquote>\n\n` +
        "Пришли новый текст одним сообщением, и я заменю им текущий."
      : "Напиши одним сообщением, что ты хотел бы получить. Я покажу это твоему Тайному Санте.",
  wishlistSaved: (wishlist: string) =>
    `✅ Вишлист сохранён:\n<blockquote>${esc(wishlist)}</blockquote>\n\n` +
    "Его увидит твой Тайный Санта. Чтобы изменить, снова отправь /wishlist.",
  wishlistTooLong: (max: number) =>
    `Слишком длинно: максимум ${max} символов. Сократи и пришли ещё раз.`,
  notDrawnYet: (game: Game) => `В «${esc(game.title)}» жеребьёвки ещё не было.`,
  noGames: "Ты пока не участвуешь ни в одной игре.",

  // ----- organizer -----
  noActiveGames: "У тебя нет активных игр. Напиши /santa в беседе, чтобы начать.",
  chooseGame: "Для какой беседы?",
  notYourGame: "Это не твоя игра.",
  alreadyDrawn: "Жеребьёвка в этой игре уже проведена.",
  noFreeParticipants: "Для пары нужно минимум двое записавшихся без пары. Сейчас таких нет.",
  pairSaved: "✅ Пара сохранена.\n\n",
  pairRejected: "Не получилось: кто-то из них уже в паре.\n\n",
  pairRemoved: "Пара удалена.\n\n",
  noParticipants: "В игре пока нет участников.",
  participantRemoved: (p: Participant) => `✅ ${esc(label(p))} больше не участвует.\n\n`,
  participantNotFound: "Этот человек уже не участвует.\n\n",
  removedNotice: (game: Game) =>
    `Организатор убрал тебя из Тайного Санты беседы «${esc(game.title)}». ` +
    "Если это ошибка, нажми «Участвую» в беседе ещё раз.",
  drawFailed: {
    already_drawn: "Жеребьёвка в этой игре уже проведена.",
    too_few: "Для жеребьёвки нужно минимум трое участников.",
    impossible:
      "С такими парами расклад невозможен: кому-то некому дарить. Убери часть пар (/pairs) или дождись новых участников.",
  } satisfies Record<DrawFailure, string>,
  drawReport: (game: Game, total: number, failed: Participant[]) => {
    let text = `Готово! Жеребьёвка в «${esc(game.title)}» проведена, участников: ${total}.`;
    if (failed.length) {
      text +=
        `\n\nНе смог написать: ${failed.map((p) => esc(label(p))).join(", ")}. ` +
        "Пусть откроют бота и отправят /me.";
    }
    return text;
  },
};
