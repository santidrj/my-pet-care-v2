---
status: accepted
---

# Authentication Service client-credentials uses JSON over HTTP

Platform services obtain a platform-service Bearer JWT from **Authentication Service** with an OAuth2-style client-credentials *grant* at `POST /oauth/token` (ADR-0016; `docs/requirements/authentication-service.md` AUTH-FR-007). The request and success response are JSON over HTTP, same as the rest of this backend (ADR-0004). The body requires `grantType` set to `client_credentials` (any other or missing value is a validation error), plus `serviceId` (the platform service id) and `secret`. A successful response includes `accessToken`, `tokenType` (`Bearer`), and `expiresIn`. Failures use RFC 9457 Problem Details (`application/problem+json`), same as every other Auth route (ADR-0010, ADR-0014)—not OAuth’s `error` / `error_description` body.

We considered classic OAuth2 `application/x-www-form-urlencoded` with `grant_type` / `client_id` / `client_secret`. That would match many OAuth clients, but it would carve an exception out of ADR-0004’s JSON wire style for one route. Keeping JSON (with camelCase field names aligned with Owner & Pet Manager) preserves one HTTP dialect across services; the path name `/oauth/token` and required `grantType` still mark the grant as client credentials.

**Consequences.** Callers send JSON, not form fields, on `POST /oauth/token`. `serviceId` values are the platform service ids already used in JWT `service` claims. Unsupported grants (password, refresh token, and so on) are out of scope on this endpoint; Owners use `/auth/login` and `/auth/refresh`.
