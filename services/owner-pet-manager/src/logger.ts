import { Transform } from "node:stream";
import pino, { type Logger } from "pino";

export type { Logger };

const stripServiceLogMessage = new Transform({
  transform(chunk, _encoding, callback) {
    const text = String(chunk);
    const lines = text.split("\n");
    const stripped = lines
      .map((line) => {
        if (line.length === 0) {
          return line;
        }
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          if (typeof record.event === "string") {
            delete record.msg;
          }
          return JSON.stringify(record);
        } catch {
          return line;
        }
      })
      .join("\n");
    callback(null, stripped);
  },
});

stripServiceLogMessage.pipe(process.stdout);

export function createLogger(level: string): Logger {
  return pino(
    {
      level,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      redact: ["req.headers.authorization"],
    },
    stripServiceLogMessage,
  );
}
