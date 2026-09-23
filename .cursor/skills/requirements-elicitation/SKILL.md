---
name: requirements-elicitation
description: >-
  Elicit requirements through a relentless interview until coverage is complete,
  then write docs/requirements/<slug>.md. Use when the user wants to gather,
  elicit, or pin down requirements; when starting a feature that lacks a
  requirements document; or when another skill needs requirements before design
  or implementation.
---

# Requirements Elicitation

Interview me relentlessly about the subject until **coverage** is complete, then write the requirements file. Walk each branch of the decision tree; resolve dependencies one-by-one. For every question, give your recommended answer.

Ask one question at a time and wait for my answer. Asking several at once is bewildering.

If a *fact* can be found by exploring the environment (filesystem, tools, codebase, existing `docs/requirements/`, `CONTEXT.md`, ADRs), look it up rather than asking me. The *decisions* are mine — put each one to me and wait.

Use the project's domain glossary (`CONTEXT.md`) as the ubiquitous language. When my wording conflicts with the glossary or is fuzzy, challenge it immediately and propose a precise term before continuing. Prefer glossary terms in the written requirements.

## Coverage

**Coverage** is complete only when every slot below is established: concrete, non-empty, and confirmed with me — not deferred, not "TBD", not implied.

| Slot | Established when |
| ---- | ---------------- |
| Actors | Who interacts with or is affected by the system is named and distinguished |
| Goals | Why we are building this — outcomes the actors care about — is stated |
| Functional requirements | What the system must do is listed as discrete, testable capabilities |
| Quality attributes (NFRs) | How well it must do it (performance, security, reliability, etc.) is stated with measurable or falsifiable targets where possible |
| Business/domain rules | Invariants and policy the domain demands are explicit |
| Constraints | Hard limits (tech, legal, time, integrations, platform) are explicit |
| Assumptions | Beliefs we are treating as true without proof are listed |
| Out-of-scope functionality | What we are deliberately not building is listed |
| Acceptance criteria | How we will know each functional requirement is done is stated (per requirement or as an exhaustive mapped set) |

Do not write the file until coverage is complete and I confirm we have a shared understanding.

## Interview loop

1. Orient: name the subject, propose a kebab-case `<slug>`, and skim existing domain/requirements context.
2. Open gaps: ask about the thinnest coverage slot first; prefer questions that unlock dependent slots.
3. After each answer, update your working model of coverage. Restate only what changed when it clarifies the next question.
4. When you believe coverage is complete, present a brief coverage checklist (slot → one-line summary) and ask me to confirm or correct.
5. On confirmation, write the file.

## Write the file

Load [template.md](template.md). Fill every section from the established coverage. Write to:

```
docs/requirements/<slug>.md
```

Create `docs/requirements/` if missing. If `<slug>.md` already exists, show the diff intent and get my OK before overwriting.

## Next step

When the file is written, tell me the path and that the natural next step is `/to-spec` — turn this requirements document (and our discussion) into a publishable spec/PRD. Do not run `/to-spec` unless I ask.
