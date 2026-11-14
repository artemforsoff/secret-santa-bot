import { InlineKeyboard } from "grammy";
import type { Game, Participant } from "../../domain/types.js";
import type { DrawSummary, Pair } from "../../services/gameService.js";
import { cb } from "../callbackData.js";
import { esc, label } from "./format.js";
import { messages } from "./messages.js";

/** Экран организатора в личке: текст и кнопки под ним. */
export interface Screen {
  text: string;
  keyboard?: InlineKeyboard;
}

const PAGE_SIZE = 8;

/** Список участников кнопками, по одному в строке, с листанием. */
function participantsKeyboard(
  participants: Participant[],
  page: number,
  itemData: (p: Participant) => string,
  pageData: (page: number) => string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const pages = Math.max(1, Math.ceil(participants.length / PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const start = current * PAGE_SIZE;
  for (const p of participants.slice(start, start + PAGE_SIZE)) kb.text(label(p), itemData(p)).row();
  if (pages > 1) {
    if (current > 0) kb.text("◀", pageData(current - 1));
    kb.text(`${current + 1}/${pages}`, pageData(current));
    if (current < pages - 1) kb.text("▶", pageData(current + 1));
    kb.row();
  }
  return kb;
}

/** Выбор беседы, если организатор ведёт несколько игр. */
export function chooseGameScreen(games: Game[], dataFor: (chatId: number) => string): Screen {
  const keyboard = new InlineKeyboard();
  for (const game of games) keyboard.text(game.title, dataFor(game.chatId)).row();
  return { text: messages.chooseGame, keyboard };
}

export function pickFirstScreen(game: Game, free: Participant[], page: number): Screen {
  if (free.length < 2) return { text: messages.noFreeParticipants };
  return {
    text: `Беседа «${esc(game.title)}».\nВыбери первого человека в паре:`,
    keyboard: participantsKeyboard(
      free,
      page,
      (p) => cb.pickSecond(game.chatId, p.userId),
      (n) => cb.pickFirst(game.chatId, n),
    ),
  };
}

export function pickSecondScreen(
  game: Game,
  first: Participant,
  candidates: Participant[],
  page: number,
): Screen {
  return {
    text: `Кто пара для <b>${esc(first.name)}</b>?`,
    keyboard: participantsKeyboard(
      candidates,
      page,
      (p) => cb.savePair(game.chatId, first.userId, p.userId),
      (n) => cb.pickSecond(game.chatId, first.userId, n),
    ).text("← Назад", cb.pickFirst(game.chatId)),
  };
}

export function pairsScreen(game: Game, pairs: Pair[], note = ""): Screen {
  const keyboard = new InlineKeyboard();
  const lines = pairs.map(([a, b], i) => {
    keyboard.text(`✖ ${a.name} + ${b.name}`, cb.removePair(game.chatId, a.userId)).row();
    return `${i + 1}. ${esc(a.name)} + ${esc(b.name)}`;
  });
  keyboard.text("➕ Добавить пару", cb.pickFirst(game.chatId));
  const body = lines.length
    ? `${lines.join("\n")}\n\nНажми на пару, чтобы удалить её.`
    : "Пар пока нет.";
  return { text: `${note}Пары в беседе «${esc(game.title)}»:\n${body}`, keyboard };
}

export function removeListScreen(game: Game, participants: Participant[], page: number, note = ""): Screen {
  if (!participants.length) return { text: note + messages.noParticipants };
  return {
    text: `${note}Беседа «${esc(game.title)}».\nКого убрать из игры?`,
    keyboard: participantsKeyboard(
      participants,
      page,
      (p) => cb.confirmRemove(game.chatId, p.userId),
      (n) => cb.removeList(game.chatId, n),
    ),
  };
}

export function confirmRemoveScreen(game: Game, participant: Participant): Screen {
  const pairNote = participant.partnerId ? "\nПара с этим участником будет расформирована." : "";
  return {
    text: `Убрать <b>${esc(label(participant))}</b> из игры в «${esc(game.title)}»?${pairNote}`,
    keyboard: new InlineKeyboard()
      .text("Да, убрать", cb.removeParticipant(game.chatId, participant.userId))
      .row()
      .text("← Назад", cb.removeList(game.chatId)),
  };
}

export function drawConfirmScreen(game: Game, summary: DrawSummary): Screen {
  const head =
    `Беседа «${esc(game.title)}»\nУчастников: ${summary.participants}\nПар: ${summary.pairs}\n\n`;
  if (!summary.enoughParticipants) return { text: head + messages.drawFailed.too_few };
  return {
    text: `${head}После жеребьёвки записаться и изменить пары будет нельзя.`,
    keyboard: new InlineKeyboard().text("🎲 Провести жеребьёвку", cb.draw(game.chatId)),
  };
}
