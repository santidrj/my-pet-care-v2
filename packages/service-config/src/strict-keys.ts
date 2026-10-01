import { ConfigError } from "./errors.js";
import {
  INSTANCE_SERVICE_EXTRA_KEYS,
  keysForInstanceRoot,
  MERGED_SERVICE_KEYS,
  PLATFORM_KEYS,
  SERVICE_SECTIONS,
  type ServiceSection,
  SHARED_SERVICE_KEYS,
} from "./shape.js";

function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknown(
  object: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new ConfigError(`Unknown key ${label}.${key}.`);
    }
  }
}

export function assertSharedDocumentShape(value: unknown): void {
  const root = assertPlainObject(value, "shared.json");
  rejectUnknown(root, SERVICE_SECTIONS, "shared.json");
  for (const section of SERVICE_SECTIONS) {
    const block = root[section];
    if (block === undefined) {
      throw new ConfigError(`shared.json is missing ${section}.`);
    }
    const object = assertPlainObject(block, `shared.json ${section}`);
    rejectUnknown(object, SHARED_SERVICE_KEYS[section], `shared.json ${section}`);
  }
}

export function assertInstanceDocumentShape(value: unknown): void {
  const root = assertPlainObject(value, "instance.json");
  rejectUnknown(root, keysForInstanceRoot(), "instance.json");
  if (root.platform !== undefined) {
    const platform = assertPlainObject(root.platform, "instance.json platform");
    rejectUnknown(platform, PLATFORM_KEYS, "instance.json platform");
  }
  for (const section of SERVICE_SECTIONS) {
    const block = root[section];
    if (block === undefined) {
      continue;
    }
    const object = assertPlainObject(block, `instance.json ${section}`);
    const allowed = [
      ...SHARED_SERVICE_KEYS[section],
      ...INSTANCE_SERVICE_EXTRA_KEYS[section],
    ];
    rejectUnknown(object, allowed, `instance.json ${section}`);
  }
}

export function assertMergedDocumentShape(value: unknown): void {
  const root = assertPlainObject(value, "config");
  const allowedRoot = ["platform", ...SERVICE_SECTIONS];
  rejectUnknown(root, allowedRoot, "config");
  if (root.platform === undefined) {
    throw new ConfigError("config is missing platform.");
  }
  const platform = assertPlainObject(root.platform, "config platform");
  rejectUnknown(platform, PLATFORM_KEYS, "config platform");
  for (const section of SERVICE_SECTIONS) {
    const block = root[section];
    if (block === undefined) {
      throw new ConfigError(`config is missing ${section}.`);
    }
    const object = assertPlainObject(block, `config ${section}`);
    rejectUnknown(object, MERGED_SERVICE_KEYS[section], `config ${section}`);
  }
}

export type DatabaseSection = Extract<
  ServiceSection,
  "ownerPetManager" | "petHealthService" | "activityManager" | "authenticationService"
>;
