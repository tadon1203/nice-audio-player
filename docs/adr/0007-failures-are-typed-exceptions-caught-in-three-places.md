# 0007: Failures are typed exceptions, caught in three places

A failure is a typed exception. TypeScript has no checked exceptions, and no Result library is widely adopted. So the Renderer does not use a Result type.

Three places catch failures:

- User actions, in `UserActionRunner`.
- Queries, through the `error` state of TanStack Query.
- Start-up, which sets `connection: "failed"`.

An absent value is a value. A failure is an exception.

## Exception: reads of decorative state

Some reads fill a view. The user cannot act on a failure of such a read. The upcoming rows that are read in chunks beyond the queue snapshot are one such read.

A failed read of this state is not reported. It is not shown as a notice. The Renderer keeps the empty value: a blank row. The Renderer may retry a failed chunk read a few times first.

The Waveform is not on this list. It is Backend state like the Playback and the Queue: the Backend holds it, sends it with `connect` and on change, and the Renderer does not ask for it. A Waveform that is still being analyzed is `null`, and the view shows no Waveform until the Backend announces one.

This is a fallback, not a fourth place that catches failures. A read of state that the user acts on still uses one of the three places.

Reason: a notice for a failure that the user cannot act on is noise. Silent fallback keeps the view usable, and the rules stay few.
