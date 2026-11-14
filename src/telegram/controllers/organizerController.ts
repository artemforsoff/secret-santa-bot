import type { Api, Bot, Context } from "grammy";
import type { Game, Participant } from "../../domain/types.js";
import type { Assignment } from "../../services/dto/index.js";
import type { GameService } from "../../services/gameService.js";
import { cb, parseCallback } from "../callbackData.js";
import { refreshCard, show } from "../render.js";
import { openBotKeyboard } from "../views/card.js";
import { HTML } from "../views/format.js";
import { messages } from "../views/messages.js";
import {
  chooseGameScreen,
  confirmRemoveScreen,
  drawConfirmScreen,
  removeListScreen,
  pairsScreen,
  pickFirstScreen,
  pickSecondScreen,
} from "../views/organizer.js";

const SEND_BATCH = 10;

/** The organizer's private chat: pairs, removing participants and the draw. Commands open a screen, buttons lead on. */
export function registerOrganizerController(bot: Bot, service: GameService): void {
  const pm = bot.chatType("private");

  // ---------- screens ----------

  const showPickFirst = async (ctx: Context, game: Game, page = 0) =>
    show(ctx, pickFirstScreen(game, await service.freeParticipants(game.chatId), page));

  const showPickSecond = async (ctx: Context, game: Game, firstId: number, page: number) => {
    const data = await service.pairCandidates(game.chatId, firstId);
    if (!data) return showPickFirst(ctx, game);
    return show(ctx, pickSecondScreen(game, data.first, data.candidates, page));
  };

  const showPairs = async (ctx: Context, game: Game, note = "") =>
    show(ctx, pairsScreen(game, await service.listPairs(game.chatId), note));

  const showRemoveList = async (ctx: Context, game: Game, page = 0, note = "") =>
    show(ctx, removeListScreen(game, await service.participants(game.chatId), page, note));

  const showConfirmRemove = async (ctx: Context, game: Game, userId: number) => {
    const participant = (await service.participants(game.chatId)).find((p) => p.userId === userId);
    if (!participant) return showRemoveList(ctx, game, 0, messages.participantNotFound);
    return show(ctx, confirmRemoveScreen(game, participant));
  };

  const removeParticipant = async (ctx: Context, game: Game, userId: number) => {
    const removed = await service.removeParticipant(game.chatId, userId);
    if (!removed) return showRemoveList(ctx, game, 0, messages.participantNotFound);
    await showRemoveList(ctx, game, 0, messages.participantRemoved(removed));
    await refreshCard(ctx.api, ctx.me.username, service, game.chatId);
    try {
      await ctx.api.sendMessage(removed.userId, messages.removedNotice(game), HTML);
    } catch (e) {
      console.error("failed to notify removed participant", e);
    }
  };

  const showDrawConfirm = async (ctx: Context, game: Game) =>
    show(ctx, drawConfirmScreen(game, await service.drawSummary(game.chatId)));

  const runDraw = async (ctx: Context, game: Game) => {
    const result = await service.draw(game.chatId);
    if (result.status === "failed") return show(ctx, { text: messages.drawFailed[result.reason] });

    const failed = await sendResults(ctx.api, game, result.assignments);
    await show(ctx, { text: messages.drawReport(game, result.assignments.length, failed) });

    await refreshCard(ctx.api, ctx.me.username, service, game.chatId);
    try {
      await ctx.api.sendMessage(game.chatId, messages.drawAnnouncement, {
        reply_markup: openBotKeyboard(ctx.me.username),
      });
    } catch (e) {
      console.error("failed to announce in group", e);
    }
  };

  // ---------- commands ----------

  /** Opens a screen for the organizer's game; with several games it first asks which one. */
  const forOrganizerGame =
    (dataFor: (chatId: number) => string, open: (ctx: Context, game: Game) => Promise<void>) =>
    async (ctx: Context & { from: { id: number } }) => {
      const games = await service.organizerGames(ctx.from.id);
      if (games.length === 0) await ctx.reply(messages.noActiveGames);
      else if (games.length === 1) await open(ctx, games[0]);
      else await show(ctx, chooseGameScreen(games, dataFor));
    };

  pm.command("pair", forOrganizerGame(cb.pickFirst, showPickFirst));
  pm.command("pairs", forOrganizerGame(cb.listPairs, showPairs));
  pm.command("remove", forOrganizerGame(cb.removeList, showRemoveList));
  pm.command("draw", forOrganizerGame(cb.confirmDraw, showDrawConfirm));

  // ---------- buttons ----------

  bot.on("callback_query:data", async (ctx) => {
    const data = parseCallback(ctx.callbackQuery.data);
    if (!data) return ctx.answerCallbackQuery();

    const access = await service.organizerAccess(data.chatId, ctx.from.id);
    if (access.status === "forbidden") return ctx.answerCallbackQuery({ text: messages.notYourGame });
    await ctx.answerCallbackQuery();
    if (access.status === "drawn") return show(ctx, { text: messages.alreadyDrawn });
    const game = access.game;

    switch (data.action) {
      case "pickFirst":
        return showPickFirst(ctx, game, data.page);
      case "pickSecond":
        return showPickSecond(ctx, game, data.firstId, data.page);
      case "savePair": {
        const saved = await service.addPair(game.chatId, data.firstId, data.secondId);
        return showPairs(ctx, game, saved ? messages.pairSaved : messages.pairRejected);
      }
      case "listPairs":
        return showPairs(ctx, game);
      case "removePair":
        await service.removePair(game.chatId, data.userId);
        return showPairs(ctx, game, messages.pairRemoved);
      case "removeList":
        return showRemoveList(ctx, game, data.page);
      case "confirmRemove":
        return showConfirmRemove(ctx, game, data.userId);
      case "removeParticipant":
        return removeParticipant(ctx, game, data.userId);
      case "confirmDraw":
        return showDrawConfirm(ctx, game);
      case "draw":
        return runDraw(ctx, game);
    }
  });
}

/** Sends everyone their recipient. Returns those who could not be messaged. */
async function sendResults(api: Api, game: Game, assignments: Assignment[]): Promise<Participant[]> {
  const failed: Participant[] = [];
  for (let i = 0; i < assignments.length; i += SEND_BATCH) {
    await Promise.all(
      assignments.slice(i, i + SEND_BATCH).map(async ({ giver, recipient, wishlist }) => {
        try {
          await api.sendMessage(giver.userId, messages.result(game, recipient, wishlist), HTML);
        } catch (e) {
          console.error("failed to notify participant", e);
          failed.push(giver);
        }
      }),
    );
  }
  return failed;
}
