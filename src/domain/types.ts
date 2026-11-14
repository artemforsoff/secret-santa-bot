export interface Game {
  chatId: number;
  title: string;
  ownerId: number;
  ownerName: string;
  /** Сообщение-карточка со списком участников в беседе. */
  messageId: number | null;
  drawn: boolean;
}

export interface Participant {
  userId: number;
  name: string;
  username: string | null;
  /** Пара участника: им нельзя выпасть друг другу. */
  partnerId: number | null;
  /** Кому участник дарит подарок; заполняется жеребьёвкой. */
  recipientId: number | null;
  joinedAt: number;
}
