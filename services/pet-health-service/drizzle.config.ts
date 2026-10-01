import { loadDatabaseUrlSync } from "@my-pet-care/service-config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = loadDatabaseUrlSync("petHealthService");
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  dbCredentials: {
    url: databaseUrl,
  },
});
