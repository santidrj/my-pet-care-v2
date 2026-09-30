import type { PlatformServiceId } from "@my-pet-care/platform-service-authenticator";

export const OWNER_ACCESS_SECONDS = 900;
export const PLATFORM_ACCESS_SECONDS = 3600;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 20 * 60 * 1000;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const RESET_WINDOW_MS = 60 * 60 * 1000;
export const LOGIN_SUBJECT_LIMIT = 5;
export const LOGIN_ADDRESS_LIMIT = 20;
export const RESET_SUBJECT_LIMIT = 3;
export const CLIENT_SUBJECT_LIMIT = 5;
export const CLIENT_ADDRESS_LIMIT = 20;

export type OwnerCredentials = {
  ownerId: string;
  passwordHash: string;
  active: boolean;
};

export type OwnerLookup =
  | { status: "found"; credentials: OwnerCredentials }
  | { status: "not_found" }
  | { status: "unavailable" };

export type SetPasswordResult =
  | { status: "updated" }
  | { status: "validation" }
  | { status: "not_found" }
  | { status: "unavailable" };

export type OwnerDirectory = {
  findByIdentifier(identifier: string): Promise<OwnerLookup>;
  findByOwnerId(ownerId: string): Promise<OwnerLookup>;
  setPassword(ownerId: string, password: string): Promise<SetPasswordResult>;
};

export type SecretHasher = {
  hash(secret: string): Promise<string>;
  verify(hash: string, secret: string): Promise<boolean>;
  dummyHash: string;
};

export type AccessTokenSigner = {
  signOwner(ownerId: string, expiresInSeconds: number, issuedAt: Date): Promise<string>;
  signPlatform(
    service: PlatformServiceId,
    expiresInSeconds: number,
    issuedAt: Date,
  ): Promise<string>;
};

export type TokenFactory = {
  newSecret(): string;
};

export type IdGenerator = {
  next(): string;
};

export type MailMessage = {
  to: string;
  link: string;
};

export type MailChannel = {
  send(message: MailMessage): Promise<void>;
};

export type RefreshVerifier = {
  verifier: string;
  current: boolean;
};

export type StoredSession = {
  id: string;
  ownerId: string;
  passwordFingerprint: string;
  createdAt: Date;
  absoluteExpiresAt: Date;
  verifiers: RefreshVerifier[];
};

export type PasswordResetRecord = {
  id: string;
  ownerId: string;
  verifier: string;
  expiresAt: Date;
  used: boolean;
};

export type PlatformClientRecord = {
  serviceId: PlatformServiceId;
  secretHash: string;
  active: boolean;
};

export type RateKind = "login" | "client_credentials" | "reset";

export type RateReservation =
  | { reserved: true; id: string }
  | { reserved: false };

export type ReserveRateSlot = {
  id: string;
  kind: RateKind;
  subject: string;
  address: string;
  now: Date;
  windowMs: number;
  subjectLimit: number;
  addressLimit: number | null;
};

export type RotateRefreshResult = "rotated" | "reused" | "missing" | "expired";

export type AuthStore = {
  insertSession(session: StoredSession): Promise<void>;
  findSessionByVerifier(verifier: string): Promise<StoredSession | null>;
  rotateRefresh(input: {
    presentedVerifier: string;
    nextVerifier: string;
    now: Date;
  }): Promise<RotateRefreshResult>;
  deleteSession(sessionId: string): Promise<void>;
  deleteSessionsForOwner(ownerId: string): Promise<void>;
  insertPasswordReset(reset: PasswordResetRecord): Promise<void>;
  findPasswordResetByVerifier(verifier: string): Promise<PasswordResetRecord | null>;
  /**
   * Locks the reset row, then asks the caller whether to consume it.
   * An unusable row never runs `decide`, so the password is not changed.
   */
  decidePasswordReset(input: {
    verifier: string;
    now: Date;
    decide: (reset: PasswordResetRecord) => Promise<"consume" | "leave">;
  }): Promise<"consumed" | "unusable" | "left">;
  findPlatformClient(serviceId: string): Promise<PlatformClientRecord | null>;
  upsertPlatformClient(client: PlatformClientRecord): Promise<void>;
  reserveRateSlot(input: ReserveRateSlot): Promise<RateReservation>;
  releaseRateSlot(id: string): Promise<void>;
  sweep(now: Date): Promise<void>;
};

export type OwnerTokenResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshToken: string;
};

export type PlatformTokenResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

export type UseCaseDeps = {
  store: AuthStore;
  owners: OwnerDirectory;
  passwords: SecretHasher;
  signer: AccessTokenSigner;
  tokens: TokenFactory;
  ids: IdGenerator;
  now: () => Date;
  delay: (ms: number) => Promise<void>;
  resetNoSendFloorMs: number;
  resetLinkTemplate: string;
  mail: MailChannel;
  setupSecret: string;
};
