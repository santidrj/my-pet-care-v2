-- Apply with: psql "$DATABASE_URL" -f sql/001_owners_pets.sql
-- Or: DATABASE_URL=... pnpm exec drizzle-kit push (from this package)

create table if not exists owners (
  id uuid primary key,
  username text not null,
  email text not null,
  password_hash text not null,
  photo text,
  active boolean not null default true,
  pet_list_visibility text not null default 'private'
);

create unique index if not exists owners_username_uidx on owners (username);
create unique index if not exists owners_email_lower_uidx on owners (lower(email));

create table if not exists pets (
  id uuid primary key,
  owner_id uuid not null references owners(id),
  name text not null,
  species text not null,
  sex text not null,
  breed text,
  date_of_birth text,
  photo text,
  active boolean not null default true
);
