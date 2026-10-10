# 0007: Failures are typed exceptions, caught in three places

A failure is a typed exception. TypeScript has no checked exceptions, and no Result library is widely adopted. So the Renderer does not use a Result type.

Three places catch failures:

- User actions, in `UserActionRunner`.
- Queries, through the `error` state of TanStack Query.
- Start-up, which sets `connection: "failed"`.

An absent value is a value. A failure is an exception.

Reason: each kind of failure has one known place to be handled. So the rules stay few.
