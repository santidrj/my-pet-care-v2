import { importPKCS8, SignJWT, type CryptoKey } from "jose";
import {
  ISSUER,
  OWNER_AUDIENCE,
  PLATFORM_AUDIENCE,
  type PlatformServiceId,
} from "@my-pet-care/platform-service-authenticator";
import type { AccessTokenSigner } from "../application/ports.js";

export async function loadPrivateKey(pem: string): Promise<CryptoKey> {
  return importPKCS8(pem, "EdDSA");
}

export function createSigner(privateKey: CryptoKey): AccessTokenSigner {
  return {
    async signOwner(ownerId, expiresInSeconds, issuedAt) {
      const issued = Math.floor(issuedAt.getTime() / 1000);
      return new SignJWT({ ownerId })
        .setProtectedHeader({ alg: "EdDSA" })
        .setIssuer(ISSUER)
        .setAudience(OWNER_AUDIENCE)
        .setIssuedAt(issued)
        .setExpirationTime(issued + expiresInSeconds)
        .sign(privateKey);
    },
    async signPlatform(service: PlatformServiceId, expiresInSeconds, issuedAt) {
      const issued = Math.floor(issuedAt.getTime() / 1000);
      return new SignJWT({ service })
        .setProtectedHeader({ alg: "EdDSA" })
        .setIssuer(ISSUER)
        .setAudience(PLATFORM_AUDIENCE)
        .setIssuedAt(issued)
        .setExpirationTime(issued + expiresInSeconds)
        .sign(privateKey);
    },
  };
}
