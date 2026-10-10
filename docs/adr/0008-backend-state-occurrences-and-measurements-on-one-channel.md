# 0008: Backend state, occurrences and measurements on one Channel

The Backend sends three kinds of message on one ordered Tauri `Channel`:

- **Backend state:** the whole value of a topic. Each topic has a monotonic revision.
- **Backend occurrence:** a fact with its value. An occurrence is never coalesced. Occurrences are used only for notices.
- **Measurement stream:** frames of measured values, such as meter frames.

This revises the event rule of [ADR 0001](0001-rust-owns-domain-and-persistent-state.md), which says that events carry no state. An occurrence carries its value.

Full event sourcing, with diffs, is rejected. Its reasons:

- It makes a second source of truth in the Renderer. This is against ADR 0001.
- It needs gap detection and resync. So snapshots are needed anyway.
- It cannot coalesce.

The Channel is used because Tauri documents that events are not designed for low latency or high throughput. Events are always JSON strings that are evaluated as JavaScript. Channels are fast and ordered.
