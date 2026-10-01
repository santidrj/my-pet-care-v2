import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type AuthDatabase = NodePgDatabase<typeof schema>;

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });

  return {
    db,
    async check(): Promise<void> {
      await db.execute(sql`select 1`);
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
