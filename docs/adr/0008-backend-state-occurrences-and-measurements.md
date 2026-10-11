# 0008: Backend state, occurrences and measurements

The Backend sends its messages on one ordered Tauri `Channel`. The `connect` Channel carries three kinds of message:

- **Backend state:** the whole value of a topic. Each topic has a monotonic revision.
- **Backend occurrence:** a fact with its value. An occurrence is never coalesced. Occurrences are used only for notices.
- **Position:** the newest position of the loaded track. It is sent far more often than state, so it is kept small and carries no state of its own.

Measurement streams, such as meter frames, do not share that Channel. Each subscription to a measurement stream has its own Channel, which is opened when the subscription starts and closed when it ends. The reasons:

- A measurement stream sends binary frames at a high rate. On the state Channel, its frames would delay the state messages behind them.
- A subscription starts and stops on its own (for example, when a view is shown or hidden). Its Channel follows that lifecycle, and the state Channel is not affected.
- A measurement stream does not relate to the order of state changes, so it gives up nothing by leaving the state Channel.

This revises the event rule of [ADR 0001](0001-rust-owns-domain-and-persistent-state.md), which says that events carry no state. An occurrence carries its value.

Full event sourcing, with diffs, is rejected. Its reasons:

- It makes a second source of truth in the Renderer. This is against ADR 0001.
- It needs gap detection and resync. So snapshots are needed anyway.
- It cannot coalesce.

The Channel is used because Tauri documents that events are not designed for low latency or high throughput. Events are always JSON strings that are evaluated as JavaScript. Channels are fast and ordered.
