# Triage Labels

This repo uses only two labels. With the local tracker, a label is the value of the `Status:` line in a ticket file.

| Label in mattpocock/skills | Label in our tracker | Meaning                                 |
| -------------------------- | -------------------- | --------------------------------------- |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent |
| (none)                     | `done`               | Implemented and committed               |

The other roles in the skills (`needs-triage`, `needs-info`, `ready-for-human`, `wontfix`) are not used. When a skill mentions one, use `ready-for-agent`, or drop the ticket instead of labeling it.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding string from this table.

When a ticket is finished, set `Status: done` and add a `**Commit:** <hash>` line. Never move finished tickets into another folder. `pnpm tickets` lists every ticket with its status.
