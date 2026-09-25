# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.
- **`docs/requirements/<slug>.md`** and **`docs/architecture/<slug>.mmd`**: read the pair for the service you are about to work in. Match on the shared filename stem. Read both when both exist. Do not hardcode the current set of services; a stem is in scope when either file exists for the area you are about to change.
- **`docs/architecture/backend.mmd`** and **`docs/architecture/system-class-diagram.mmd`**: read these when the work crosses service boundaries.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates `CONTEXT.md` and ADRs lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
├── docs/requirements/
│   └── <slug>.md
├── docs/architecture/
│   ├── <slug>.mmd
│   ├── backend.mmd
│   └── system-class-diagram.mmd
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
├── docs/requirements/
│   └── <slug>.md
├── docs/architecture/
│   ├── <slug>.mmd
│   ├── backend.mmd
│   └── system-class-diagram.mmd
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

`CONTEXT.md` is the only glossary. Requirements docs say what a service must do, and architecture diagrams describe structure. If a requirements doc uses a word the glossary says to avoid, use the glossary term and flag the requirements doc. Don't add glossary entries from those folders during ordinary work; that still belongs to `/domain-modeling`.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

If your output contradicts an in-scope requirements doc, surface it the same way:

> _Contradicts `docs/requirements/<slug>.md`, but worth reopening because…_

If an in-scope ADR and an in-scope requirements doc contradict each other, stop and surface both. Do not pick a winner.

Architecture diagrams are descriptive. If a diagram disagrees with an ADR or a requirements doc, and those two agree, follow them and flag the diagram as stale.
