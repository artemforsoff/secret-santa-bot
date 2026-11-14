export interface Game {
  chatId: number;
  title: string;
  ownerId: number;
  ownerName: string;
  /** The latest card message with the participant list in the group. */
  messageId: number | null;
  /**
   * All cards of the current game: every /santa and /list posts a new one, and all of them must be
   * refreshed, otherwise an older (e.g. pinned) message goes stale. Games started before this field
   * existed do not have it; then the only card is messageId.
   */
  messageIds?: number[];
  drawn: boolean;
}

/** Per-user data shared across all of the user's games. */
export interface UserProfile {
  /** What the user would like to get; only their Secret Santa sees it. */
  wishlist: string | null;
  /** When the user ran /wishlist and the bot started waiting for the text; null if not waiting. */
  wishlistPendingAt: number | null;
}

export interface Participant {
  userId: number;
  name: string;
  username: string | null;
  /** The participant's partner: the two must not be drawn for each other. */
  partnerId: number | null;
  /** Who the participant gives a gift to; set by the draw. */
  recipientId: number | null;
  joinedAt: number;
}
