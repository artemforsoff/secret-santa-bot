export type SaveWishlistResult =
  | { status: "saved"; wishlist: string }
  | { status: "too_long"; max: number };

/** Result of a plain private message: not_pending means the bot was not waiting for a wishlist. */
export type SubmitWishlistResult = SaveWishlistResult | { status: "not_pending" };
