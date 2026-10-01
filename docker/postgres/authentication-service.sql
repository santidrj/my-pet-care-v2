-- Same tables as services/authentication-service/src/schema.ts.
-- Created if missing. Later boots do not drop them.

create table if not exists owner_sessions (
  id uuid primary key,
  owner_id uuid not null,
  password_fingerprint text not null,
  created_at timestamptz not null,
  absolute_expires_at timestamptz not null
);

create table if not exists refresh_verifiers (
  session_id uuid not null references owner_sessions (id) on delete cascade,
  verifier text not null,
  current boolean not null,
  primary key (session_id, verifier)
);

create unique index if not exists refresh_verifiers_verifier_uidx
  on refresh_verifiers (verifier);

create table if not exists password_resets (
  id uuid primary key,
  owner_id uuid not null,
  verifier text not null unique,
  expires_at timestamptz not null,
  used boolean not null
);

create table if not exists platform_clients (
  service_id text primary key,
  secret_hash text not null,
  active boolean not null
);

create table if not exists rate_slots (
  id uuid primary key,
  kind text not null,
  subject text not null,
  address text not null,
  created_at timestamptz not null
);
