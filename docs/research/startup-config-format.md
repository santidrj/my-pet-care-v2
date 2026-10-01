# Startup config format and loader

Primary sources point to **JSON, parsed with Node’s `JSON.parse`, validated with Zod `z.strictObject`, and merged by a few lines of our own**. The document needs nested objects and real numbers, booleans, and strings. Node 24’s env-file APIs, dotenv, and INI all stop at flat strings. The libraries that already deep-merge a defaults file with an override also own file discovery, a `NODE_ENV` file ladder, or a second schema language. Versions below are the npm registry `latest` documents on 1 October 2026. Node API quotes are from the [v24.21.0](https://nodejs.org/dist/index.json) tag (`nodejs.org/dist/index.json` lists that release on 2026-09-07).

## Source → what it provides

### Formats

| Format | Nesting and types | Comments | Owning source |
| --- | --- | --- | --- |
| **JSON** | Objects and arrays. Values are strings, numbers, `true`, `false`, or `null`. | Not in the grammar. Whitespace is space, tab, LF, and CR. A parser MAY accept non-JSON extensions. | [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) §2–§3, §9 |
| **JSON5** | Same types, plus identifier keys, trailing commas, hex numbers, `Infinity`, and `NaN`. | `//` and `/* */` | [JSON5 spec](https://spec.json5.org/) 1.0.0 (March 2018): “a proposed extension to JSON”; “Single and multi-line comments are allowed.” |
| **JSONC** | JSON types. VS Code’s jsonc mode also accepts trailing commas and warns on them. | `//` and `/* */` | No IETF grammar. [VS Code JSON docs](https://code.visualstudio.com/docs/languages/json): “JSON with Comments (jsonc)” for `settings.json`, `tasks.json`, `launch.json`. [jsonc-parser](https://github.com/microsoft/node-jsonc-parser) README: “JSONC is JSON with JavaScript style comments,” and `parse` is fault tolerant. |
| **TOML 1.1.0** | Tables and dotted keys become nested objects. Strings, integers, floats, booleans, dates, arrays. | `#` to end of line, outside strings | [TOML v1.1.0](https://toml.io/en/v1.1.0) (GitHub release 2025-12-24). v1.0.0 (2021-01-12) already had comments, those scalars, and tables. |
| **YAML 1.2.2** | Block and flow mappings (nested). JSON schema resolves `true`/`false`, integers, and floats. Core schema, the recommended default, also resolves `True`/`FALSE`, `null`/`Null`/`~`, `0o` octal, and `0x` hex. | Comments must not affect the data model. | [YAML 1.2.2](https://yaml.org/spec/1.2.2/) §3.2.3.3, §8.2.2, §10.2–§10.3 |
| **INI** | One level of `[section]` headers, then keys. Not arbitrary nesting. | `#` and `;` | No single owning spec. [Python `configparser`](https://docs.python.org/3/library/configparser.html) implements “a structure similar to what’s found in Microsoft Windows INI files” and is “always storing them internally as strings.” Other datatypes are converted by the caller (`getint()`, `getfloat()`). |
| **`.env`** | One `KEY=value` line. No nested objects. Values are strings. | `#` | [Node `--env-file`](https://nodejs.org/docs/latest-v24.x/api/cli.html#--env-filefile). [dotenv README](https://github.com/motdotla/dotenv/blob/master/README.md) documents the same shape and cites twelve-factor. |

On this machine, Node v25.8.2’s `JSON.parse` throws `SyntaxError` on a comment and on a trailing comma, and returns a number for `1` and a boolean for `true`. That matches RFC 8259’s grammar. It is not a v24.21.0 run.

### Node.js 20.12+ / 21.7+ / 22 / 24

| API | Documented behavior |
| --- | --- |
| [`--env-file=file`](https://nodejs.org/docs/latest-v24.x/api/cli.html#--env-filefile) | Added in v20.6.0. Multi-line values added in v20.12.0 and v21.7.0. No longer experimental as of v24.10.0. “The format of the file should be one line per key-value pair of environment variable name and value separated by `=`.” `#` comments, quotes, and `export ` are supported. A missing file throws. If the variable is already in the environment, the environment wins. Later `--env-file` arguments override earlier files. `NODE_OPTIONS` in the file is applied. |
| [`--env-file-if-exists=file`](https://nodejs.org/docs/latest-v24.x/api/cli.html#--env-file-if-existsfile) | Added in v22.9.0. Same behavior, and a missing file does not throw. Stable as of v24.10.0. |
| [`process.loadEnvFile(path)`](https://nodejs.org/docs/latest-v24.x/api/process.html#processloadenvfilepath) | Added in v20.12.0 and v21.7.0. Stable as of v24.10.0. Loads a `.env` file into `process.env`. Default path `'./.env'`. “Usage of `NODE_OPTIONS` in the `.env` file will not have any effect on Node.js.” |
| [`util.parseEnv(content)`](https://nodejs.org/docs/latest-v24.x/api/util.html#utilparseenvcontent) | Added in v20.12.0 and v21.7.0. Stable as of v24.10.0. “The raw contents of a `.env` file.” The documented call `parseEnv('HELLO=world\nHELLO=oh my\n')` returns `{ HELLO: 'oh my' }`. |
| [`process.env`](https://nodejs.org/docs/latest-v24.x/api/process.html#processenv) | “Assigning a property on `process.env` will implicitly convert the value to a string.” |
| [`--experimental-config-file`](https://nodejs.org/docs/latest-v24.x/api/cli.html#--experimental-config-filepath--experimental-config-file) | Added in v23.10.0. Stability 1.0, “Early development.” Reads a JSON file of Node CLI flags (`nodeOptions`, `test`, `watch`), default name `node.config.json`. “Node.js will not sanitize or perform validation on the user-provided configuration.” |

The v24 [documentation index](https://github.com/nodejs/node/blob/v24.21.0/doc/api/index.md) lists no schema-validation module and no deep-merge module. The env-file grammar is one flat key per line, and the `parseEnv` example returns strings. A port in that file is the string `"3001"`.

### Libraries

Registry `latest` on 1 October 2026. “Deep-merge” means the library’s own docs describe combining several config files so that nested keys overlay. “Env → nested” means those docs describe placing an environment variable onto a nested key.

| Package | Latest (published) | Runtime dependencies | Deep-merge | Env → nested | Validates |
| --- | --- | --- | --- | --- | --- |
| [`config`](https://www.npmjs.com/package/config) (node-config) | 5.0.1 (2026-08-18). Engines `node >= 20.11.0` | `json5` | Yes. Files overlay “on a parameter by parameter basis.” [Arrays are replaced wholesale](https://github.com/node-config/node-config/wiki/Configuration-Files#arrays-are-merged-by-replacement). | Yes, via [`custom-environment-variables.json`](https://github.com/node-config/node-config/wiki/Environment-Variables#custom-environment-variables). Unformatted values stay strings; `__format` can be `boolean`, `number`, or `json`. `NODE_CONFIG` may be a JSON string. | `config.get()` throws for an undefined key. The configuration-files and environment-variables wiki pages do not describe a type schema. |
| [`convict`](https://www.npmjs.com/package/convict) | 6.2.5 (2026-03-19). Engines `node >= 6` | `yargs-parser`, `lodash.clonedeep` | Yes. [`loadFile`](https://github.com/mozilla/node-convict/blob/master/packages/convict/README.md) “loads and merges one or multiple JSON configuration files.” | Yes. Each setting may set `env`. “Convict will automatically coerce environmental variables from strings” (`parseInt` / `parseFloat` for numeric formats). Env outranks `loadFile`. | Yes. `validate({ allowed: 'strict' })` throws on properties the schema does not declare. “Every setting must have a default value.” |
| [`c12`](https://www.npmjs.com/package/c12) | 4.0.0-rc.2 (2026-09-22). No `engines` field. Dist-tag `3x` is 3.3.4 | rc.2: `rc9`, `defu`, `pathe`, `confbox`, `exsolve`, `pkg-types`. 3.3.4 also depends on `dotenv`, `jiti`, `giget`, `chokidar`, and others | Yes, with [defu](https://github.com/unjs/defu), across cwd config, rc files, the user config directory, `package.json`, and extended layers | The documented dotenv option loads flat `.env` files. The readme’s example reads `process.env` inside a JS config module. It does not map one env name onto a nested key of a data file. | The main (v4) readme accepts a [Standard Schema](https://standardschema.dev), including Zod, and throws on failure. |
| [`cosmiconfig`](https://www.npmjs.com/package/cosmiconfig) | 10.0.1 (2026-08-30). Engines `node: ^22.18 \|\| >= 24` | `js-yaml`, `env-paths` | No. `search` / `load` return one file. | No | No |
| [`dotenv`](https://www.npmjs.com/package/dotenv) | 18.0.5 (2026-09-30). Engines `node >= 12` | none | No. Multiple files combine flat keys. Without `override`, the first value wins and existing `process.env` is kept. | No. Values go onto `process.env`. | No |
| [`dotenv-expand`](https://www.npmjs.com/package/dotenv-expand) | 1000.0.0 (2026-07-29). Engines `node >= 16` | none | No | No. It expands `${VAR}` (and, per its readme, command substitutions and encrypted values) into `process.env` strings. | No |
| [`smol-toml`](https://www.npmjs.com/package/smol-toml) | 1.9.0 (2026-09-22). Engines `node >= 18` | none | No. `parse` / `stringify` only. | No | No |
| [`@iarna/toml`](https://www.npmjs.com/package/@iarna/toml) | 2.2.5 (2020-04-22). No `engines` field | none | No. `TOML.parse` / `TOML.stringify` only. | No | No |
| [`yaml`](https://www.npmjs.com/package/yaml) (eemeli) | 2.9.1 (2026-09-11). Engines `node >= 14.6` | none | No. `parse` / `stringify` only. | No | No |
| [`json5`](https://www.npmjs.com/package/json5) | 2.2.3 (2022-12-31). Engines `node >= 6` | none | No. `JSON5.parse` only. | No | No |
| [`zod`](https://www.npmjs.com/package/zod) | 4.6.5 (2026-09-13). No `engines` field. Readme: “Works in Node.js and all modern browsers.” | none | No. It does not load files. | No. It does not read `process.env`. | Yes. `.parse()` throws `ZodError`. `.safeParse()` returns a result object. |

None of these READMEs say the project is abandoned. `@iarna/toml`’s npm `latest` is still the April 2020 publish. Its registry metadata records `_nodeVersion` `13.13.0` (the Node version used to publish, not an `engines` range). The GitHub `latest` branch README still describes TOML 1.0.0-rc.1 (a 2019 pre-release). A separate dist-tag `toml-1.0.0-rc.1` points at version 3.0.0, which is not `latest`.

## Tradeoffs stated by primary sources

- **Typed nesting against comments.** RFC 8259 already has the types this document needs, and Node parses it with no dependency. Comments are outside that grammar. JSON5, JSONC, TOML, and YAML add comments by adding a parser. JSON5’s own readme says it is for files “write[n] and maintain[ed] by hand” and “is not intended to be used for machine-to-machine communication.”
- **Implicit types.** TOML integers, floats, booleans, and dates are explicit tokens ([v1.1.0](https://toml.io/en/v1.1.0)). `smol-toml` documents an `integersAsBigInt` option because JavaScript numbers are not 64-bit integers; the default path does not preserve every TOML integer losslessly. YAML 1.2 core schema, which [eemeli’s docs](https://eemeli.org/yaml/#schema-options) say is the default (`parse('3')` is the number `3`), also treats `True`, `NULL`, `0o7`, and `.inf` as typed scalars. The `yaml-1.1` schema parses `No` as `false`. The same readme says the parser “can accept any string as input without throwing, parsing as much YAML out of it as it can.”
- **Fail closed.** jsonc-parser’s readme describes a fault-tolerant `parse`. A missing or corrupt startup file has to abort the process. `JSON.parse` throws. Zod’s `.parse()` throws `ZodError`.
- **Twelve-factor.** [III. Config](https://12factor.net/config) says config is what varies between deploys (database handles, credentials, canonical hostnames), and that “the twelve-factor app stores config in environment variables.” An uncommitted config file, its example being Rails `config/database.yml`, is “a huge improvement” over constants in the repo and still weaker: it is easy to commit by mistake, files scatter across formats, and the format is often language-specific. Config that does not vary between deploys, such as Rails `config/routes.rb`, “does not” fall under that rule and “is best done in the code.” Named groups such as `development` / `test` / `production` “do not scale cleanly.” The shared file is the non-varying layer (twelve-factor would rather see it in code). The instance file is the varying layer (twelve-factor would rather see every leaf in the environment). The chosen design keeps both in files and allows one process env var to replace one leaf after the merge. That is the tension, not a resolution of it. dotenv’s readme quotes the same rule and says to avoid inheritance (“`.env.production` inherits values from `.env`”). Our overlay is that inheritance, limited to one shared file and one instance file.
- **Env values are strings.** `parseEnv`’s example and `process.env`’s string conversion mean an override of a numeric or boolean leaf has to be parsed again. Convict documents that coercion itself (`parseInt` / `parseFloat`). Zod documents `z.coerce.number()` as `Number(input)` and `z.coerce.boolean()` as `Boolean(input)` ([zod.dev/api](https://zod.dev/api)). `Boolean("false")` is not the boolean `false`.

## Recommendation for My Pet Care

Context: five processes, plus migrate scripts and drizzle-kit, read two files from `MPC_CONFIG_DIR` once at startup. Tests do not. The shared file is committed and identical across deploys. The instance file is an uncommitted partial overlay whose leaves replace the shared file, including arrays as leaves (the same array rule [node-config documents](https://github.com/node-config/node-config/wiki/Configuration-Files#arrays-are-merged-by-replacement)). One process environment variable may then replace one leaf. A missing or invalid required value exits the process.

| Piece | Choice |
| --- | --- |
| Format | **JSON** ([RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)) |
| Loader | **Node built-in.** `readFile` + `JSON.parse` for each file. No parser package. The v24 docs do not provide a deep-merge, so the overlay is a few lines of our own: recurse into plain objects, replace every other value. |
| Validation | **Zod `z.strictObject`.** [zod.dev](https://zod.dev/api#zstrictobject): `z.object()` strips unrecognized keys; `z.strictObject` throws when unknown keys are found. `.parse()` throws `ZodError`, which startup turns into an exit. Zod 4.6.5 (`^4.6.5`) is already a direct dependency of `@my-pet-care/service-skeleton`, `@my-pet-care/contracts`, and the Owner, Health, Activity, and Authentication services. The community collaborator stub does not depend on it today. |
| Env override | **A few lines of our own**, after the merge and before the final parse. A fixed map sends one known env name to one leaf. Unset means “leave the merged value.” Set means “replace that leaf.” The raw `process.env` string must be parsed with that leaf’s schema. Use `z.coerce.number()` only where the schema is a number. Do not use `z.coerce.boolean()` for the string `false`. |

`MPC_CONFIG_DIR` stays the only bootstrap variable. It is a single path, which is what `--env-file` and `process.env` are for. The shared file and the instance file are the two JSON documents in that directory.

### Considered and rejected

- **`.env` via Node, dotenv, or dotenv-expand.** Node’s grammar is one string per line. Five services cannot share one flat `PORT`. dotenv 18 tells readers to avoid env-file inheritance. dotenv-expand 1000.0.0 still writes strings, and its readme adds command substitution. `loadEnvFile` already covers a `.env` file, so dotenv adds no capability this design uses.
- **INI.** `configparser` stores every value as a string and groups keys under one section level. That cannot express `platform` plus a nested object per service with numeric ports.
- **JSONC and JSON5.** Both add comments, which this design does not require. JSONC has no spec, and jsonc-parser is fault tolerant. JSON5’s readme reserves itself for hand-edited files and tells machine exchange to stay on JSON. `json5` 2.2.3 was last published on 2022-12-31. `JSON.parse` rejects comments and trailing commas, so a JSON file cannot quietly grow JSONC syntax.
- **TOML via `smol-toml` or `@iarna/toml`.** TOML 1.1.0 has comments, typed values, and tables, and `smol-toml` 1.9.0 has no runtime dependencies and declares `node >= 18`. It loses because `JSON.parse` is built in and the files do not need comments. `@iarna/toml` 2.2.5 is the 2020 publish, and its current README still targets TOML 1.0.0-rc.1. If comments inside the shared file become a requirement, `smol-toml` is the parser to add.
- **YAML via `yaml`.** The 1.2 core schema types more unquoted scalars than this document needs, and the package readme says invalid input does not throw. It would also be a new runtime dependency.
- **node-config as the loader.** It is the closest published model: a `default` file, an untracked `local` file, per-key overwrite, `NODE_CONFIG_DIR`, and a JSON map from env names to nested keys. Its [load order](https://github.com/node-config/node-config/wiki/Configuration-Files#file-load-order) also reads `{deployment}`, hostname, and `{instance}` files, and an unset `NODE_ENV` defaults to `development`. In that wiki `{instance}` means `NODE_APP_INSTANCE`, another process on the same machine. Here an instance is one deployment. Taking the library would pull that file ladder. It depends on `json5`. It does not type-check the document.
- **convict as the schema.** `loadFile` plus `validate({ allowed: 'strict' })` plus a per-field `env` is the behavior we want, and numeric env values are coerced. The schema is convict’s own `{ format, default, env }` objects, and every setting must have a default, beside Zod, which already validates HTTP bodies. Runtime dependencies are `yargs-parser` and `lodash.clonedeep`. Engines still say `node >= 6`.
- **c12.** `loadConfig` merges cwd files, rc files, the user config directory, `package.json`, and extended layers, including `$development`-style keys. That discovery is wider than two explicit paths in `MPC_CONFIG_DIR`. The registry `latest` is the release candidate `4.0.0-rc.2`. The stable `3x` tag (3.3.4) pulls in `dotenv`, `jiti`, `giget`, and `chokidar` as well.
- **cosmiconfig.** It finds one file by walking directories. Engines include Node 24. It does not merge a shared file with an instance file, and it does not validate. It depends on `js-yaml`.

## Sources

- RFC 8259 — https://www.rfc-editor.org/rfc/rfc8259
- JSON5 1.0.0 — https://spec.json5.org/
- JSON5 README — https://github.com/json5/json5/blob/main/README.md
- VS Code, JSON with Comments — https://code.visualstudio.com/docs/languages/json
- jsonc-parser README — https://github.com/microsoft/node-jsonc-parser/blob/main/README.md
- TOML v1.1.0 — https://toml.io/en/v1.1.0 (tag text: https://github.com/toml-lang/toml/blob/1.1.0/toml.md)
- TOML releases — https://github.com/toml-lang/toml/releases/tag/1.1.0
- YAML 1.2.2 — https://yaml.org/spec/1.2.2/
- Python `configparser` — https://docs.python.org/3/library/configparser.html
- Twelve-Factor App, III. Config — https://12factor.net/config
- Node.js v24.21.0 release index — https://nodejs.org/dist/index.json
- Node.js v24.21.0 `--env-file` — https://github.com/nodejs/node/blob/v24.21.0/doc/api/cli.md
- Node.js v24.21.0 `process.loadEnvFile` and `process.env` — https://github.com/nodejs/node/blob/v24.21.0/doc/api/process.md
- Node.js v24.21.0 `util.parseEnv` — https://github.com/nodejs/node/blob/v24.21.0/doc/api/util.md
- Node.js v24.21.0 API index — https://github.com/nodejs/node/blob/v24.21.0/doc/api/index.md
- node-config README — https://github.com/node-config/node-config/blob/master/README.md
- node-config configuration files — https://github.com/node-config/node-config/wiki/Configuration-Files
- node-config environment variables — https://github.com/node-config/node-config/wiki/Environment-Variables
- convict package README — https://github.com/mozilla/node-convict/blob/master/packages/convict/README.md
- c12 README — https://github.com/unjs/c12/blob/main/README.md
- cosmiconfig README — https://github.com/cosmiconfig/cosmiconfig/blob/main/README.md
- dotenv README — https://github.com/motdotla/dotenv/blob/master/README.md
- dotenv-expand README — https://github.com/dotenvx/dotenv-expand/blob/master/README.md
- smol-toml README — https://github.com/squirrelchat/smol-toml/blob/master/README.md
- @iarna/toml README (`latest` branch) — https://github.com/iarna/iarna-toml/blob/latest/README.md
- yaml README (v2.9.1) — https://github.com/eemeli/yaml/blob/v2.9.1/README.md
- yaml schema options — https://eemeli.org/yaml/#schema-options
- Zod package README — https://github.com/colinhacks/zod/blob/main/packages/zod/README.md
- Zod `z.strictObject` and `z.coerce` — https://zod.dev/api
