import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";
import { ConfigError } from "./errors.js";
import { applyEnvOverrides } from "./env-overrides.js";
import { mergeDocuments } from "./merge.js";
import {
  type DatabaseSection,
  assertInstanceDocumentShape,
  assertMergedDocumentShape,
  assertSharedDocumentShape,
} from "./strict-keys.js";
import { mergedConfigSchema, type MergedConfig } from "./schema.js";

const SHARED_FILE = "shared.json";
const INSTANCE_FILE = "instance.json";

export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.MPC_CONFIG_DIR;
  if (dir === undefined || dir.length === 0) {
    throw new ConfigError("MPC_CONFIG_DIR is required.");
  }
  return dir;
}

function parseJsonFile(contents: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new ConfigError(`${label} is not valid JSON.`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function formatZodError(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    const first = issues[0];
    if (first) {
      const path = first.path.length > 0 ? first.path.join(".") : "config";
      return `${path}: ${first.message}`;
    }
  }
  return "config validation failed.";
}

function validateMerged(document: Record<string, unknown>): MergedConfig {
  assertMergedDocumentShape(document);
  const result = mergedConfigSchema.safeParse(document);
  if (!result.success) {
    throw new ConfigError(formatZodError(result.error));
  }
  return result.data;
}

async function readConfigDocuments(
  configDir: string,
): Promise<{ shared: Record<string, unknown>; instance: Record<string, unknown> }> {
  const sharedPath = path.join(configDir, SHARED_FILE);
  const instancePath = path.join(configDir, INSTANCE_FILE);
  let sharedRaw: string;
  let instanceRaw: string;
  try {
    sharedRaw = await readFileAsync(sharedPath, "utf8");
  } catch {
    throw new ConfigError(`Could not read ${sharedPath}.`);
  }
  try {
    instanceRaw = await readFileAsync(instancePath, "utf8");
  } catch {
    throw new ConfigError(`Could not read ${instancePath}.`);
  }
  const shared = parseJsonFile(sharedRaw, SHARED_FILE);
  const instance = parseJsonFile(instanceRaw, INSTANCE_FILE);
  assertSharedDocumentShape(shared);
  assertInstanceDocumentShape(instance);
  return { shared, instance };
}

function readConfigDocumentsSync(
  configDir: string,
): { shared: Record<string, unknown>; instance: Record<string, unknown> } {
  const sharedPath = path.join(configDir, SHARED_FILE);
  const instancePath = path.join(configDir, INSTANCE_FILE);
  let sharedRaw: string;
  let instanceRaw: string;
  try {
    sharedRaw = readFileSync(sharedPath, "utf8");
  } catch {
    throw new ConfigError(`Could not read ${sharedPath}.`);
  }
  try {
    instanceRaw = readFileSync(instancePath, "utf8");
  } catch {
    throw new ConfigError(`Could not read ${instancePath}.`);
  }
  const shared = parseJsonFile(sharedRaw, SHARED_FILE);
  const instance = parseJsonFile(instanceRaw, INSTANCE_FILE);
  assertSharedDocumentShape(shared);
  assertInstanceDocumentShape(instance);
  return { shared, instance };
}

function buildMergedRaw(
  shared: Record<string, unknown>,
  instance: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Record<string, unknown> {
  const merged = mergeDocuments(shared, instance);
  applyEnvOverrides(merged, env);
  return merged;
}

export async function loadMergedConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<MergedConfig> {
  const configDir = resolveConfigDir(env);
  const { shared, instance } = await readConfigDocuments(configDir);
  const merged = buildMergedRaw(shared, instance, env);
  return validateMerged(merged);
}

export function loadMergedConfigSync(env: NodeJS.ProcessEnv = process.env): MergedConfig {
  const configDir = resolveConfigDir(env);
  const { shared, instance } = readConfigDocumentsSync(configDir);
  const merged = buildMergedRaw(shared, instance, env);
  return validateMerged(merged);
}

export async function loadDatabaseUrl(
  section: DatabaseSection,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const configDir = resolveConfigDir(env);
  const { shared, instance } = await readConfigDocuments(configDir);
  const merged = buildMergedRaw(shared, instance, env);
  assertMergedDocumentShape(merged);
  const block = merged[section];
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    throw new ConfigError(`config is missing ${section}.`);
  }
  const databaseUrl = (block as Record<string, unknown>).databaseUrl;
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    throw new ConfigError(`${section}.databaseUrl is required.`);
  }
  return databaseUrl;
}

export function loadDatabaseUrlSync(
  section: DatabaseSection,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configDir = resolveConfigDir(env);
  const { shared, instance } = readConfigDocumentsSync(configDir);
  const merged = buildMergedRaw(shared, instance, env);
  assertMergedDocumentShape(merged);
  const block = merged[section];
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    throw new ConfigError(`config is missing ${section}.`);
  }
  const databaseUrl = (block as Record<string, unknown>).databaseUrl;
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    throw new ConfigError(`${section}.databaseUrl is required.`);
  }
  return databaseUrl;
}

export function platformProcessEnv(
  platform: MergedConfig["platform"],
  service: { authBaseUrl: string; platformClientActive: boolean },
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PLATFORM_SERVICE_SECRET: platform.serviceSecret,
    PLATFORM_SETUP_SECRET: platform.setupSecret,
    AUTH_BASE_URL: service.authBaseUrl,
    PLATFORM_CLIENT_ACTIVE: service.platformClientActive ? "true" : "false",
  };
}
