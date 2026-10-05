# Triage Labels

This repo uses only two labels. With the local tracker, a label is the value of the `Status:` line in a ticket file.

| Label in mattpocock/skills | Label in our tracker | Meaning                                 |
| -------------------------- | -------------------- | --------------------------------------- |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent |
| (none)                     | `done`               | Implemented and committed               |

This repo does not use the other roles in the skills (`needs-triage`, `needs-info`, `ready-for-human`, `wontfix`). If a skill mentions one, use `ready-for-agent`, or drop the ticket.

If a skill mentions a role (for example, "apply the AFK-ready triage label"), use the string from this table.
