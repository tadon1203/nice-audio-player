# Domain Docs

How the engineering skills consume this repo's domain documentation.

This is a single-context repo. Before exploring, read:

- **`CONTEXT.md`** at the repo root: the glossary.
- **`docs/adr/`**: the ADRs that touch the area you are about to work in.

If either is missing, proceed silently. The `/domain-modeling` skill (reached via `/grill-with-docs`) creates them lazily.

When your output names a domain concept (an issue title, a refactor proposal, a test name), use the term as defined in `CONTEXT.md` and not a synonym it avoids. If the concept is not in the glossary, either reconsider the wording or note the gap for `/domain-modeling`.

If your output contradicts an existing ADR, say so explicitly instead of silently overriding it.
