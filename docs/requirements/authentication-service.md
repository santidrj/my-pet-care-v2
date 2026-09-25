# Authentication Service — Requirements

## Purpose

This document defines the requirements for the **Authentication Service** of the My Pet Care platform. It states what the service must do so developers and agents can implement and verify behavior. Creating an Owner stays in Owner & Pet Manager.

## Goals

- An Owner can sign in and call the other services as themselves.
- An Owner who forgot their password can set a new one and sign in again.
- A deactivated Owner, or an Owner whose password has changed, stops receiving new access tokens.

## Actors

| Actor | Description |
| ----- | ----------- |
| **Owner** | The person who logs in, refreshes a login, logs out, and resets a forgotten password. |
| **Owner & Pet Manager** | The service that stores the password hash and active status, enforces identifier and password rules, and tells this service to revoke refresh tokens. |

## Scope

### In scope

- Login with a username or email and a password
- Issuing a short-lived Bearer JWT access token and a rotating refresh token for an Owner
- Refresh, logout, and revocation of refresh tokens
- Forgotten-password reset by email
- Rate limits on login failures and on reset links
- Reading the password hash and active status from Owner & Pet Manager, and failing when that call cannot be completed

### Out of scope

- Creating an Owner
- Platform-service tokens
- An access-token denylist and an idle timeout
- Multi-factor authentication and social login
- Changing a password while already logged in, beyond revoking refresh tokens when Owner & Pet Manager reports the change
- Encryption at rest
- Where the client stores tokens

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

## Constraints

- This service is part of this repo’s backend and signs Owner tokens (ADR-0011, which supersedes ADR-0008).
- Access tokens are Bearer JWTs. An Owner token carries that Owner’s id. Other services verify the signature locally. This service does not issue platform-service tokens.
- The password hash is an Argon2id string stored by Owner & Pet Manager (ADR-0012, which supersedes ADR-0009). This service verifies that hash. It does not share Owner & Pet Manager’s database.
- The hash and active status are read from Owner & Pet Manager over a synchronous call. The hash is readable by this service only, not by Owners or other clients.
- Owner & Pet Manager enforces password strength on create and on password change: at least 8 characters, at least 64 characters allowed, any character including spaces, and rejection of commonly used or known-breached passwords (ADR-0012). No mix of letters, digits, or symbols is required. Login does not re-check strength.
- Each service keeps its own data. Cross-service calls are synchronous, as in ADR-0002.

## Assumptions

- A mail channel can send one message to an Owner’s email address.
- Owner & Pet Manager can return the hash and active status to this service, and can store a new password from a completed reset.
- The client IP address is the caller address this service sees.
- A list of commonly used and known-breached passwords is available to Owner & Pet Manager.
- Other services keep verifying access tokens locally until those tokens expire.

## Functional requirements

### AUTH-FR-001 — Login

**Description:** The service checks one identifier and a password and, on success, issues an Owner access token and a refresh token.

**Acceptance criteria:**

1. The caller submits one identifier string and a password.
2. A valid email is looked up with case ignored. A legal username is looked up case-sensitively.
3. An identifier that is neither a legal username nor a valid email fails as a validation error. The password is not checked.
4. On success, the Owner is active, the password matches the Argon2id hash from Owner & Pet Manager, and the response includes a Bearer JWT access token carrying that Owner’s id and expiring in 15 minutes, plus a refresh token that expires at most 30 days after this login.
5. Unknown identifier, wrong password, and a deactivated Owner fail the same way. The caller cannot tell those cases apart.
6. When Owner & Pet Manager cannot be reached, login fails without a token. That failure is distinct from rejected credentials.
7. The response never includes the password or the hash.

### AUTH-FR-002 — Refresh

**Description:** The service exchanges a current refresh token for a new access token and a new refresh token.

**Acceptance criteria:**

1. A current refresh token yields a new 15-minute access token for the same Owner and a new refresh token. The presented refresh token is no longer usable.
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

**Description:** The service revokes every refresh token for an Owner when Owner & Pet Manager reports that the Owner was deactivated or the password changed.

**Acceptance criteria:**

1. A deactivation notice for an Owner revokes every refresh token for that Owner.
2. A password-change notice for an Owner revokes every refresh token for that Owner.
3. Access tokens already issued remain valid until they expire.
4. A later refresh still fails if the Owner is deactivated or the hash no longer matches the login, even when the notice never arrived (see AUTH-FR-002).

## Quality attributes (NFRs)

### AUTH-NFR-001 — Latency

**Description:** Login, refresh, logout, and reset complete within a bound under normal load.

**Acceptance criteria:**

1. Under **normal load**, p95 response time is **< 2s** for login, refresh, logout, request password reset, and complete password reset.
2. The metric refers to the service’s handling time under normal load (exact harness defined in the test plan).

### AUTH-NFR-002 — Credential and token protection

**Description:** Passwords, reset secrets, and tokens are protected in transit and are not disclosed by the service.

**Acceptance criteria:**

1. Calls that carry a password, reset link, or token use **TLS**.
2. Passwords, password hashes, and reset secrets are never included in API responses or logs.
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
