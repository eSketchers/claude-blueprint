---
description: Read a PRD, produce a technical spec + a set of ticket JSON files the orchestrator can pick up.
argument-hint: <path-to-PRD.md> [output-dir]
allowed-tools: Read, Write, Bash, Glob, Grep
---

# /generate-tickets

You are turning a product requirements document (PRD) into an agency-ready backlog.

Arguments: `$ARGUMENTS` — first is the PRD file path; second (optional) is the output directory for ticket JSON files (default: `tickets/`).

## Phase 1 — Read & absorb

1. Read the PRD file completely.
2. If the PRD is thin or has open questions, list them before continuing — do NOT silently guess. Ask the operator for missing info unless `--auto` is set.

## Phase 2 — Technical spec

Invoke the `architect` subagent with the PRD. Ask them to produce `docs/tech-spec.md` covering:

- Problem statement + user flows
- Architecture (services, data stores, key dependencies)
- Data model (tables / collections with fields + relationships)
- API contracts (endpoints, request/response shapes)
- Authentication & authorization model
- Non-functional requirements (latency, scale, compliance)
- Risks & open questions

Keep it under ~800 words — a reading doc, not a novel.

## Phase 3 — Decompose into tickets

Break the spec into **independently shippable tickets**. Rules:

- Each ticket is ≤ 1 day of agent work — if bigger, split.
- One concern per ticket (schema OR endpoint OR UI component — not all three).
- Dependencies explicit: declare `depends_on: ["polls-003"]` if the work can't start until another ticket is merged.
- Start with infrastructure / scaffolding tickets, then models, then endpoints, then UI.
- Cover testing as its own tickets when non-trivial; small features can bundle tests inline.

## Phase 4 — Write ticket files

For each ticket, write one JSON file to `<output-dir>/<nn>-<slug>.json`:

```json
{
  "id": "polls-001",
  "title": "Scaffold Django project with polls app",
  "kind": "feature",
  "description": "Full prose describing the ticket: context, acceptance criteria, files to touch, test plan, non-goals. Multi-line.",
  "repo_path": "/absolute/path/to/local/repo",
  "labels": ["backend", "scaffold"],
  "depends_on": []
}
```

- `id`: stable, human-readable, slug-compatible (`polls-001`, `polls-002`, ...).
- `repo_path`: set to the **absolute** path of the local git clone. The orchestrator will `cd` into it before spawning the agent.
- `description`: include acceptance criteria as a bulleted list — this is what the agent will work against.

Number tickets sequentially. Keep filenames sortable (`01-scaffold.json`, `02-model.json`, ...).

## Phase 5 — Report

Output to the operator:

- Count of tickets generated
- Path where they were written
- A table: ID · title · depends_on
- Any open questions that blocked full spec-out

Do **not** create GitHub issues, branches, or code in this command — only the spec doc + ticket JSON files. The orchestrator (if running) will pick up the tickets and spawn agents from there.
