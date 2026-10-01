import { loadDatabaseUrlSync } from "@my-pet-care/service-config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = loadDatabaseUrlSync("ownerPetManager");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  ...(databaseUrl
    ? {
        dbCredentials: {
          url: databaseUrl,
        },
      }
    : {}),
});
