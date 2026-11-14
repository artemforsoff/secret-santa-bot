import { createHash } from "node:crypto";

/** Секрет вебхука выводится из токена бота, чтобы не хранить второй секрет. */
export const webhookSecret = (token: string) => createHash("sha256").update(token).digest("hex");
