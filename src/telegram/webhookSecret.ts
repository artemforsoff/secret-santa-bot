import { createHash } from "node:crypto";

/** The webhook secret is derived from the bot token so there is no second secret to store. */
export const webhookSecret = (token: string) => createHash("sha256").update(token).digest("hex");
