import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });

  return {
    async check(): Promise<void> {
      await db.execute(sql`select 1`);
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
