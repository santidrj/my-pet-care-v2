import { jwtVerify, type JWTPayload, type CryptoKey } from "jose";

export const ISSUER = "my-pet-care:authentication-service" as const;
export const OWNER_AUDIENCE = "my-pet-care" as const;
export const PLATFORM_AUDIENCE = "my-pet-care:platform" as const;
export const CLOCK_TOLERANCE_SECONDS = 60 as const;
/** Only EdDSA (Ed25519) JWTs are accepted for inbound verification. */
export const JWT_ALGORITHM = "EdDSA" as const;

export const PLATFORM_SERVICE_IDS = [
  "owner-pet-manager",
  "pet-health-service",
  "activity-manager",
  "authentication-service",
  "community",
] as const;

export type PlatformServiceId = (typeof PLATFORM_SERVICE_IDS)[number];

export type Actor =
  | { kind: "owner"; ownerId: string }
  | { kind: "platform"; service: PlatformServiceId };

/** Alias matching the HTTP contract vocabulary. */
export type TrustedActor = Actor;

export type VerifyTokenOptions = {
  publicKey: CryptoKey | Uint8Array;
};

export class TokenVerificationError extends Error {
  constructor(message = "Token verification failed") {
    super(message);
    this.name = "TokenVerificationError";
  }
}

function isPlatformServiceId(value: unknown): value is PlatformServiceId {
  return (
    typeof value === "string" &&
    (PLATFORM_SERVICE_IDS as readonly string[]).includes(value)
  );
}

function audienceIncludes(aud: JWTPayload["aud"], expected: string): boolean {
  if (typeof aud === "string") {
    return aud === expected;
  }
  if (Array.isArray(aud)) {
    return aud.includes(expected);
  }
  return false;
}

function claimPresent(value: unknown): boolean {
  return value !== undefined;
}

/**
 * Exactly one actor shape: a non-empty string `ownerId`, or a valid `service`.
 * Presence of both claims (even an empty/non-string `ownerId`) is rejected (PSA-FR-001.4).
 */
function extractActor(payload: JWTPayload): Actor {
  const ownerIdPresent = claimPresent(payload.ownerId);
  const servicePresent = claimPresent(payload.service);

  if (ownerIdPresent === servicePresent) {
    throw new TokenVerificationError();
  }

  if (ownerIdPresent) {
    if (typeof payload.ownerId !== "string" || payload.ownerId.length === 0) {
      throw new TokenVerificationError();
    }
    if (!audienceIncludes(payload.aud, OWNER_AUDIENCE)) {
      throw new TokenVerificationError();
    }
    return { kind: "owner", ownerId: payload.ownerId };
  }

  if (!isPlatformServiceId(payload.service)) {
    throw new TokenVerificationError();
  }
  if (!audienceIncludes(payload.aud, PLATFORM_AUDIENCE)) {
    throw new TokenVerificationError();
  }
  return { kind: "platform", service: payload.service };
}

export async function verifyToken(
  token: string,
  options: VerifyTokenOptions,
): Promise<Actor> {
  try {
    const { payload } = await jwtVerify(token, options.publicKey, {
      issuer: ISSUER,
      audience: [OWNER_AUDIENCE, PLATFORM_AUDIENCE],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      algorithms: [JWT_ALGORITHM],
      requiredClaims: ["exp"],
    });
    return extractActor(payload);
  } catch (error) {
    if (error instanceof TokenVerificationError) {
      throw error;
    }
    throw new TokenVerificationError();
  }
}
