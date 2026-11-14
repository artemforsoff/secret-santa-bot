export interface Game {
  chatId: number;
  title: string;
  ownerId: number;
  ownerName: string;
  /** Последнее сообщение-карточка со списком участников в беседе. */
  messageId: number | null;
  /**
   * Все карточки текущей игры: каждый /santa и /list выкладывает новую, и обновлять нужно все,
   * иначе старое (например, закреплённое) сообщение устаревает. В играх, начатых до появления
   * этого поля, его нет — тогда карточка одна, messageId.
   */
  messageIds?: number[];
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
