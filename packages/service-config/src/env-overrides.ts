import { ConfigError } from "./errors.js";
import { MERGED_SERVICE_KEYS, PLATFORM_KEYS, type ServiceSection } from "./shape.js";

function camelToEnvPart(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toUpperCase()
    .replace(/^_/, "");
}

export function envKeyForLeaf(section: string, leaf: string): string {
  return `MPC_${camelToEnvPart(section)}_${camelToEnvPart(leaf)}`;
}

type LeafPath = { section: string; leaf: string; kind: "string" | "number" | "boolean" | "stringArray" };

const LEAF_PATHS: LeafPath[] = [
  ...PLATFORM_KEYS.map((leaf) => ({
    section: "platform",
    leaf,
    kind: "string" as const,
  })),
  ...(
    [
      "ownerPetManager",
      "petHealthService",
      "activityManager",
      "authenticationService",
      "communityCollaborator",
    ] as const
  ).flatMap((section) =>
    MERGED_SERVICE_KEYS[section].map((leaf) => {
      let kind: LeafPath["kind"] = "string";
      if (leaf === "port" || leaf === "resetNoSendFloorMs") {
        kind = "number";
      } else if (leaf === "platformClientActive") {
        kind = "boolean";
      } else if (leaf === "communityOwnerIds") {
        kind = "stringArray";
      }
      return { section, leaf, kind };
    }),
  ),
];

function parseBoolean(raw: string): boolean {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new ConfigError(`Invalid boolean override for ${raw}.`);
}

function parseNumber(raw: string, label: string): number {
  if (!/^[0-9]+$/.test(raw)) {
    throw new ConfigError(`Invalid number override for ${label}.`);
  }
  return Number(raw);
}

function parseStringArray(raw: string, label: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(`Invalid JSON array override for ${label}.`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new ConfigError(`Invalid JSON array override for ${label}.`);
  }
  return parsed;
}

function setLeaf(
  document: Record<string, unknown>,
  section: string,
  leaf: string,
  value: unknown,
): void {
  const block = document[section];
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    document[section] = { [leaf]: value };
    return;
  }
  (block as Record<string, unknown>)[leaf] = value;
}

export function applyEnvOverrides(
  document: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const { section, leaf, kind } of LEAF_PATHS) {
    const envKey = envKeyForLeaf(section, leaf);
    const raw = env[envKey];
    if (raw === undefined || raw.length === 0) {
      continue;
    }
    const label = `${envKey}`;
    let value: unknown;
    switch (kind) {
      case "string":
        value = raw;
        break;
      case "number":
        value = parseNumber(raw, label);
        break;
      case "boolean":
        value = parseBoolean(raw);
        break;
      case "stringArray":
        value = parseStringArray(raw, label);
        break;
    }
    setLeaf(document, section, leaf, value);
  }
}
