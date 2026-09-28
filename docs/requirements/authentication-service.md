# Authentication Service — Requirements

## Purpose

This document defines the requirements for the **Authentication Service** of the My Pet Care platform. It states what the service must do so developers and agents can implement and verify behavior. Creating an Owner stays in Owner & Pet Manager.

## Goals

- An Owner can sign in and call the other services as themselves.
- An Owner who forgot their password can set a new one and sign in again.
- A deactivated Owner, or an Owner whose password has changed, stops receiving new access tokens.
- A platform service can obtain a short-lived access token that proves which service is calling.

## Actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | The person who logs in, refreshes a login, logs out, and resets a forgotten password. |
| **Owner & Pet Manager** | The service that stores the password hash and active status, enforces identifier and password rules, and tells this service to revoke refresh tokens. |
| **Platform service** | A backend service that authenticates with a configured service id and secret to obtain a platform-service access token (see `platform-service-authenticator.md`). |

## Scope

### In scope

- Login with a username or email and a password
- Issuing a short-lived Bearer JWT access token and a rotating refresh token for an Owner
- Refresh, logout, and revocation of refresh tokens
- Forgotten-password reset by email
- Rate limits on login failures, reset links, and client-credentials failures
- Reading the password hash and active status from Owner & Pet Manager, and failing when that call cannot be completed
- Client-credentials grant that issues a platform-service access token
- A registry of platform clients (service id, Argon2id secret hash, active/disabled), seeded at deploy/ops time

### Out of scope

- Creating an Owner
- An access-token denylist and an idle timeout
- Multi-factor authentication and social login
- Changing a password while already logged in, beyond revoking refresh tokens when Owner & Pet Manager reports the change
- Encryption at rest
- Where the client stores tokens
- Per-route authorization in other services (those services’ functional requirements; see also `platform-service-authenticator.md`)
- A public CRUD API for platform clients, and secret-rotation UX or automated rotation orchestration
- Per-target (per-service) token audiences

## Business / domain rules

- Login accepts one identifier string and a password. A valid email is looked up as an email. A legal username is looked up as a username.
- A **username** is one or more ASCII letters, digits, `_`, or `-`, and is matched case-sensitively. An **email** has a single `@`, a non-empty local part, and a domain with a dot and no whitespace, and is matched with case ignored. No string is both.
- Owner & Pet Manager enforces those identifier rules, case-sensitive username uniqueness, and case-insensitive email uniqueness on create and update.
- A deactivated Owner cannot obtain an access token or a reset link.
- Unknown identifier, wrong password, and deactivated Owner fail login the same way. The caller learns only that the credentials were not accepted.
- An identifier that is neither a legal username nor a valid email fails login as a validation error, and the password is not checked.
- Unknown email and a deactivated Owner fail a reset request the same way. The caller learns only that the reset did not start.
- A string that is not a valid email fails a reset request as a validation error.
- An access token remains valid until it expires. This service does not cancel an access token already issued.
- Logout revokes only the login whose refresh token was presented. Deactivation, a password change, and a completed reset revoke every refresh token for that Owner.
- There is no idle timeout. A refresh token lasts at most 30 days from the login that issued it.
- Owner access tokens carry claim `ownerId` (that Owner’s id), `aud` = `my-pet-care`, and `iss` = `my-pet-care:authentication-service`. Platform-service access tokens carry claim `service` (exactly one of `owner-pet-manager`, `pet-health-service`, `activity-manager`, `authentication-service`, `community`), `aud` = `my-pet-care:platform`, and the same `iss`. Owner id and platform-service claims are mutually exclusive on one JWT.
- A platform client may receive a token only for its own configured service id.
- Unknown service id, wrong secret, and a disabled or unknown client fail client-credentials the same way. The caller learns only that the credentials were not accepted.
- A missing service id or secret fails client-credentials as a validation error, distinct from rejected credentials.
- Only an active platform client receives new tokens. Disabling a client stops new tokens immediately; already-issued platform JWTs remain valid until they expire.
- There is no refresh token for platform credentials. Renewal is a new client-credentials grant.
- The client-credentials endpoint does not require a Bearer JWT. An Owner JWT must not be usable to mint a platform-service token.

## Constraints

- This service is part of this repo’s backend and is the central issuer of Owner and platform-service Bearer JWTs (ADR-0016, which supersedes ADR-0011 and ADR-0008).
- Access tokens are Bearer JWTs. An Owner token carries claim `ownerId` and `aud` = `my-pet-care`. A platform-service token carries claim `service` and `aud` = `my-pet-care:platform`. Both carry `iss` = `my-pet-care:authentication-service`. Other services verify the signature locally via the platform-service authenticator. Platform-token obtainment and presentation for outbound calls are specified in `platform-service-authenticator.md`.
- The Owner password hash is an Argon2id string stored by Owner & Pet Manager (ADR-0012, which supersedes ADR-0009). This service verifies that hash. It does not share Owner & Pet Manager’s database.
- Platform client secrets are stored by this service as Argon2id hashes (same family as ADR-0012). Cleartext secrets are not retained after provisioning.
- The Owner hash and active status are read from Owner & Pet Manager over a synchronous call. The Owner hash is readable by this service only, not by Owners or other clients.
- Owner & Pet Manager enforces password strength on create and on password change: at least 8 characters, at least 64 characters allowed, any character including spaces, and rejection of commonly used or known-breached passwords (ADR-0012). No mix of letters, digits, or symbols is required. Login does not re-check strength.
- Each service keeps its own data. Cross-service calls are synchronous, as in ADR-0002.

## Assumptions

- A mail channel can send one message to an Owner’s email address.
- Owner & Pet Manager can return the hash and active status to this service, and can store a new password from a completed reset.
- The client IP address is the caller address this service sees.
- A list of commonly used and known-breached passwords is available to Owner & Pet Manager.
- Other services keep verifying access tokens locally until those tokens expire.
- Platform clients are seeded at deploy/ops time with a service id and secret; v1 has no Owner-facing registration of platform clients.
- Outbound calls to Owner & Pet Manager (credential reads and set-password) present this service’s platform JWT (`service` = `authentication-service`) obtained via the platform-service authenticator.

## Functional requirements

### AUTH-FR-001 — Login

**Description:** The service checks one identifier and a password and, on success, issues an Owner access token and a refresh token.

**Acceptance criteria:**

1. The caller submits one identifier string and a password.
2. A valid email is looked up with case ignored. A legal username is looked up case-sensitively.
3. An identifier that is neither a legal username nor a valid email fails as a validation error. The password is not checked.
4. On success, the Owner is active, the password matches the Argon2id hash from Owner & Pet Manager, and the response includes a Bearer JWT access token with `ownerId` set to that Owner’s id, `iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care`, and expiring in 15 minutes, plus a refresh token that expires at most 30 days after this login.
5. Unknown identifier, wrong password, and a deactivated Owner fail the same way. The caller cannot tell those cases apart.
6. When Owner & Pet Manager cannot be reached, login fails without a token. That failure is distinct from rejected credentials.
7. The response never includes the password or the hash.

### AUTH-FR-002 — Refresh

**Description:** The service exchanges a current refresh token for a new access token and a new refresh token.

**Acceptance criteria:**

1. A current refresh token yields a new 15-minute access token for the same Owner (`ownerId`, `iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care`) and a new refresh token. The presented refresh token is no longer usable.
2. The new refresh token expires no later than 30 days after the original login.
3. Presenting a refresh token that was already rotated revokes that whole login. Later refresh with any token from that login fails.
4. Refresh checks Owner & Pet Manager again. It fails when the Owner is deactivated or the stored password hash is no longer the one this login was issued against, and it issues no token.
5. When Owner & Pet Manager cannot be reached, refresh fails without a token. That failure is distinct from a rejected refresh token.

### AUTH-FR-003 — Logout

**Description:** The service ends the login whose refresh token the caller presents.

**Acceptance criteria:**

1. Presenting a current refresh token revokes that login. A later refresh with a token from that login fails.
2. Other logins for the same Owner stay usable.
3. An access token already issued for that login remains valid until it expires.

### AUTH-FR-004 — Request password reset

**Description:** The service starts a forgotten-password reset for an active Owner’s email.

**Acceptance criteria:**

1. The caller submits an email address.
2. A string that is not a valid email fails as a validation error.
3. When the email matches an active Owner, the service sends one message containing a single-use link that expires in 20 minutes.
4. Unknown email and a deactivated Owner fail the same way. No link is sent. The caller learns only that the reset did not start.
5. When the email matches an active Owner but the message cannot be sent, the request fails as a delivery error the caller can retry, and no usable link is created.
6. When Owner & Pet Manager cannot be reached, the request fails without a link. That failure is distinct from “reset did not start.”
7. Each email yields at most 3 reset links per hour (see AUTH-NFR-004).

### AUTH-FR-005 — Complete password reset

**Description:** The service sets a new password for the Owner bound to a valid reset link and revokes that Owner’s refresh tokens.

**Acceptance criteria:**

1. A single-use link that is still inside its 20 minutes, together with a new password, updates the password through Owner & Pet Manager.
2. Owner & Pet Manager’s password-strength rules apply. A password that fails them is a validation error, and the link remains usable until it expires or a later attempt succeeds.
3. On success, every refresh token for that Owner is revoked, and the link cannot be used again.
4. An expired, unknown, or already-used link fails and does not change the password.
5. When Owner & Pet Manager cannot be reached, completion fails and does not change the password.

### AUTH-FR-006 — Revoke on deactivation or password change

**Description:** The service revokes every refresh token for an Owner when Owner & Pet Manager reports that the Owner was deactivated or the password changed. The notice is authenticated as a platform call from Owner & Pet Manager.

**Acceptance criteria:**

1. A deactivation notice for an Owner, presented with a valid platform Bearer JWT whose `service` is `owner-pet-manager`, revokes every refresh token for that Owner.
2. A password-change notice for an Owner, presented the same way, revokes every refresh token for that Owner.
3. Access tokens already issued remain valid until they expire.
4. A later refresh still fails if the Owner is deactivated or the hash no longer matches the login, even when the notice never arrived (see AUTH-FR-002).
5. A missing or invalid JWT, or a platform JWT whose `service` is not `owner-pet-manager`, fails the notice and does not revoke tokens.
6. Notices are idempotent: repeating the same revoke for an Owner that already has no refresh tokens succeeds without error.
7. When Authentication Service itself completes a password reset (AUTH-FR-005), it revokes that Owner’s refresh tokens in-process; the optional OPM password-change notice for the same change is also idempotent if it arrives.

### AUTH-FR-007 — Platform client-credentials grant

**Description:** The service authenticates a platform client with a service id and secret and, on success, issues a platform-service access token for that client only.

**Acceptance criteria:**

1. The caller submits a service id and a secret. The endpoint does not require a Bearer JWT.
2. Missing service id or secret fails as a validation error. The secret is not checked when the request is malformed.
3. On success, the client is active, the secret matches the stored Argon2id hash, and the response includes a Bearer JWT access token that expires in **1 hour**, with `iss` = `my-pet-care:authentication-service`, `aud` = `my-pet-care:platform`, and claim `service` set to that client’s service id among the allowed platform service ids. The response does not include a refresh token. The response includes `expires_in` (seconds) reflecting that lifetime.
4. The issued token never carries `ownerId`. A client never receives a token for a different service id.
5. Unknown service id, wrong secret, and a disabled or unknown client fail the same way. The caller cannot tell those cases apart.
6. An Owner access token presented instead of client credentials does not yield a platform-service token.
7. The response never includes the cleartext secret or the secret hash.

## Quality attributes (NFRs)

### AUTH-NFR-001 — Latency

**Description:** Login, refresh, logout, reset, and client-credentials complete within a bound under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **< 2s** for login, refresh, logout, request password reset, complete password reset, and client-credentials.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### AUTH-NFR-002 — Credential and token protection

**Description:** Passwords, platform client secrets, reset secrets, and tokens are protected in transit and are not disclosed by the service.

**Acceptance criteria:**

1. Calls that carry a password, platform client secret, reset link, or token use **TLS**.
2. Passwords, password hashes, platform client secrets, platform client secret hashes, and reset secrets are never included in API responses or logs.
3. Encryption at rest is out of scope.

### AUTH-NFR-003 — Login rate limit

**Description:** Repeated login failures are slowed without locking the Owner out.

**Acceptance criteria:**

1. After 5 login failures for one identifier in any 15-minute window, further login attempts for that identifier are rejected as try-again-later until the window passes.
2. After 20 login failures from one client IP address in any 15-minute window, further login attempts from that address are rejected as try-again-later until the window passes.
3. Both caps count failures for identifiers and addresses that match no Owner.
4. Try-again-later is distinct from rejected credentials and does not reveal whether an Owner exists.
5. The Owner is not locked out. A later attempt inside the rules of AUTH-FR-001 can succeed.

### AUTH-NFR-004 — Reset link rate limit

**Description:** Reset messages to one email are capped.

**Acceptance criteria:**

1. Each email address receives at most 3 reset links in any one-hour window.
2. Further reset requests for that email are rejected as try-again-later until the window passes.
3. The cap counts requests for emails that match no Owner.
4. Try-again-later does not reveal whether an Owner exists.

### AUTH-NFR-005 — Client-credentials rate limit

**Description:** Repeated client-credentials failures are slowed without permanently disabling the platform client.

**Acceptance criteria:**

1. After 5 client-credentials failures for one service id in any 15-minute window, further attempts for that service id are rejected as try-again-later until the window passes.
2. After 20 client-credentials failures from one client IP address in any 15-minute window, further attempts from that address are rejected as try-again-later until the window passes.
3. Both caps count failures for service ids that match no client.
4. Try-again-later is distinct from rejected credentials and does not reveal whether a platform client exists.
5. Successful grants are not limited by these failure caps. The platform client is not permanently locked out; a later attempt inside the rules of AUTH-FR-007 can succeed.
