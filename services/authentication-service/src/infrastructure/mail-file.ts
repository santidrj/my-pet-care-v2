import { appendFile } from "node:fs/promises";
import type { MailChannel } from "../application/ports.js";

const MAIL_TIMEOUT_MS = 5_000;

export function createFileMailChannel(path: string): MailChannel {
  return {
    async send(message) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Mail send aborted."));
        }, MAIL_TIMEOUT_MS);
        appendFile(path, `${message.link}\n`, { encoding: "utf8" }).then(
          () => {
            clearTimeout(timer);
            resolve();
          },
          (err: unknown) => {
            clearTimeout(timer);
            reject(err);
          },
        );
      });
    },
  };
}

export function createFailingMailChannel(): MailChannel {
  return {
    async send() {
      throw new Error("Mail sink is not configured.");
    },
  };
}
