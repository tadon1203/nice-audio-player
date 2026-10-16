# 0007: Failures are typed exceptions, caught in three places

A failure is a typed exception. TypeScript has no checked exceptions, and no Result library is widely adopted. So the Renderer does not use a Result type.

Three places catch failures:

- User actions, in `UserActionRunner`.
- Queries, through the `error` state of TanStack Query.
- Start-up, which sets `connection: "failed"`.

An absent value is a value. A failure is an exception.

## Exception: reads of decorative state

Some reads fill a view. The user cannot act on a failure of such a read. These reads are:

- The Waveform of the loaded track.
- The upcoming rows that are read in chunks beyond the queue snapshot.

A failed read of this state is not reported. It is not shown as a notice. The Renderer keeps the empty value: no Waveform, or a blank row. The Renderer may retry a failed chunk read a few times first.

This is a fallback, not a fourth place that catches failures. A read of state that the user acts on still uses one of the three places.

Reason: a notice for a failure that the user cannot act on is noise. Silent fallback keeps the view usable, and the rules stay few.
