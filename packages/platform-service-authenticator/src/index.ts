export {
  verifyToken,
  TokenVerificationError,
  ISSUER,
  OWNER_AUDIENCE,
  PLATFORM_AUDIENCE,
  CLOCK_TOLERANCE_SECONDS,
  PLATFORM_SERVICE_IDS,
  type Actor,
  type PlatformServiceId,
  type VerifyTokenOptions,
} from "./verify-token.js";

export {
  createOutboundCredentialProvider,
  PlatformTokenUnavailableError,
  DEFAULT_SKEW_MARGIN_SECONDS,
  type OutboundCredentialProvider,
  type OutboundCredentialProviderOptions,
} from "./outbound.js";

export {
  platformServiceAuthenticator,
  registerPlatformServiceAuthenticator,
  isPublicRoute,
  type AuthenticatorPluginOptions,
  type PublicRoutePattern,
} from "./plugin.js";

export { unauthorizedProblem } from "@my-pet-care/contracts";
