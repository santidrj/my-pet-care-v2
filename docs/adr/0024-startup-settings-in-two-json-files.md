---
status: accepted
---

# Startup settings live in two JSON files

Each backend process loads its settings once, from two JSON files in the directory named by `MPC_CONFIG_DIR`. `shared.json` is committed and holds the defaults that are the same for every deployment. `instance.json` is a partial overlay for one deployment, holds that deployment’s secrets and local values, and is not committed. `config/instance.example.json` is the committed template. A non-empty environment variable named `MPC_`, then the section, then the leaf (`MPC_OWNER_PET_MANAGER_PORT`) replaces that one leaf after the merge. An empty value leaves the merged leaf in place. A misspelled `MPC_` name is ignored.

An **instance** here is one deployment of the platform (a developer machine, CI, or a later staging or production environment). All five processes in that deployment read the same two files. The word is not `NODE_APP_INSTANCE`, and it is not the glossary’s **global** (a platform-default Activity type).

The document has a `platform` section and one section per service. Objects merge. Arrays and scalars in the instance file replace the shared value. `JSON.parse` reads the files. Zod `z.strictObject` checks the merged document: an unknown key or a wrong type aborts the process. A service process also exits when any required leaf is still missing. Numbers in an override are decimal integers. Booleans are the words `true` and `false`. Lists are JSON arrays. JSON strings are not interpolated. `@my-pet-care/service-config` owns the loader and depends on Zod, not on Fastify. Service ids and the Authentication Service sweep interval stay in code. Owner & Pet Manager derives the token URL from `authBaseUrl` plus `/oauth/token`.

Migrate and drizzle-kit load the same files, reject unknown keys, and require only that service’s `databaseUrl`. Tests keep their own environment variables and do not open the instance file.

We considered leaving settings in the environment, node-config, convict, c12, and TOML. Node 24’s env-file APIs are flat strings, so one `PORT` cannot mean five services. node-config merges a default file with an untracked local file, and its `{instance}` file is another process on the same machine, selected with hostname and `NODE_ENV`. convict and c12 bring a second schema or a wider file search. TOML (`smol-toml`) is the parser to add if the shared file must contain comments. The comparison is `docs/research/startup-config-format.md`. Twelve-factor wants deploy-specific values in the environment. The instance file is that layer on disk. It stays uncommitted, and one leaf can still be injected with `MPC_`.

**Consequences.** `pnpm dev` sets `MPC_CONFIG_DIR` to the repo `config/` directory. Both files must exist. The public JWT key path is one `platform` leaf. The private key path belongs to Authentication Service. Database URLs, the platform secrets, and the reset-link template live in the instance file. Ports `3001`–`3005`, `logLevel` `info`, the local base URLs, `platformClientActive` `true`, and `resetNoSendFloorMs` `1000` live in the shared file.
