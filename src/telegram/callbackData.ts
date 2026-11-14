/**
 * Данные инлайн-кнопок организатора. Формат: "<код>:<chatId>[:<аргументы>]".
 * Коды менять нельзя: кнопки в уже отправленных сообщениях должны продолжать работать.
 */
export type Callback =
  | { action: "pickFirst"; chatId: number; page: number }
  | { action: "pickSecond"; chatId: number; firstId: number; page: number }
  | { action: "savePair"; chatId: number; firstId: number; secondId: number }
  | { action: "listPairs"; chatId: number }
  | { action: "removePair"; chatId: number; userId: number }
  | { action: "confirmDraw"; chatId: number }
  | { action: "draw"; chatId: number };

export const cb = {
  pickFirst: (chatId: number, page = 0) => `a:${chatId}:${page}`,
  pickSecond: (chatId: number, firstId: number, page = 0) => `b:${chatId}:${firstId}:${page}`,
  savePair: (chatId: number, firstId: number, secondId: number) => `s:${chatId}:${firstId}:${secondId}`,
  listPairs: (chatId: number) => `l:${chatId}`,
  removePair: (chatId: number, userId: number) => `d:${chatId}:${userId}`,
  confirmDraw: (chatId: number) => `c:${chatId}`,
  draw: (chatId: number) => `g:${chatId}`,
};

export function parseCallback(data: string): Callback | undefined {
  const [code, chat, x, y] = data.split(":");
  const chatId = Number(chat);
  if (!chat || !Number.isFinite(chatId)) return undefined;
  const num = (s: string | undefined) => Number(s ?? 0);
  switch (code) {
    case "a":
      return { action: "pickFirst", chatId, page: num(x) };
    case "b":
      return { action: "pickSecond", chatId, firstId: num(x), page: num(y) };
    case "s":
      return { action: "savePair", chatId, firstId: num(x), secondId: num(y) };
    case "l":
      return { action: "listPairs", chatId };
    case "d":
      return { action: "removePair", chatId, userId: num(x) };
    case "c":
      return { action: "confirmDraw", chatId };
    case "g":
      return { action: "draw", chatId };
    default:
      return undefined;
  }
}
