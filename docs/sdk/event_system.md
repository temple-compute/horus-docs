---
sidebar_position: 5
title: Event System
---

# Event System

The Horus Runtime **Event System** provides a **fire-and-forget, asynchronous mechanism** for tasks and workflows to communicate with each other and with external systems. It is **sync-first**: you emit events from synchronous code, while asynchronous transports handle delivery in a dedicated background thread.

## Architecture Overview

The Event System is composed of four abstractions:

| Component      | Class                 | Responsibility                                                    |
| -------------- | --------------------- | ----------------------------------------------------------------- |
| **Event Bus**  | `HorusEventBus`       | Central hub. Dispatches to subscribers and forwards to transports |
| **Event**      | `BaseEvent`           | Immutable message representing a discrete occurrence              |
| **Subscriber** | `BaseEventSubscriber` | Handles events of a declared type (or all events)                 |
| **Transport**  | `BaseBusTransport`    | Defines how events are delivered (local, remote broker, etc.)     |

When `emit()` is called, two things happen in order:

1. The event is passed synchronously to all registered **subscribers** on the calling thread.
2. The event is submitted to every registered **transport** via a `BusAsyncLoopThread`, a background asyncio loop running in a daemon thread, so transports never block the caller.

## Emitting Events

All runtime components and task implementations access the bus through the [Runtime Context](./context.md):

```python
from horus_runtime.context import HorusContext

ctx = HorusContext.get_context()
ctx.bus.emit(MyEvent(message="something happened"))
```

`emit()` runs all subscriber handlers synchronously on the calling thread and returns only after they complete. It does not wait for transports, whose delivery happens asynchronously in the background.

## Event Bus

`HorusEventBus` manages the full lifecycle of the event pipeline.

### Lifecycle Methods

| Method                     | Description                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `start()`                  | Instantiates all registered transports and subscribers, calls `setup()` on each subscriber, and starts the background async loop. |
| `stop()`                   | Gracefully shuts down all transports by awaiting their `stop()` coroutines, then stops the background thread.                     |
| `emit(event)`              | Dispatches the event synchronously to subscribers, then submits it to transports.                                                 |
| `subscribe(subscriber)`    | Registers a subscriber manually.                                                                                                  |
| `add_transport(transport)` | Registers a transport manually.                                                                                                   |

`start()` auto-discovers transports and subscribers from the runtime registry, any class registered under the `"horus.transport"` or `"horus.subscriber"` entry points is instantiated automatically. Manual registration via `subscribe()` and `add_transport()` is also supported.

## Defining Events

All events inherit from `BaseEvent`, which is a **frozen Pydantic model**. Fields are populated automatically at construction time:

| Field        | Type             | Description                                                            |
| ------------ | ---------------- | ---------------------------------------------------------------------- |
| `event_id`   | `uuid.UUID`      | Unique identifier, auto-generated.                                     |
| `timestamp`  | `datetime`       | UTC creation time, auto-generated.                                     |
| `source`     | `str`            | Caller's qualified name, auto-inferred from the call stack.            |
| `event_type` | `Any`            | Must be defined by each subclass. Used as the registry key.            |
| `message`    | `str \| None`    | Optional human-readable description.                                   |
| `level`      | `LoggerLevel`    | Severity hint for event logging (`"INFO"`, `"WARNING"`, `"ERROR"`, …). |
| `data`       | `dict[str, Any]` | Arbitrary extra payload.                                               |

Events are **immutable** (`frozen=True`) and **automatically registered** in the runtime registry under the `"event"` entry point using `event_type` as the discriminator key.

```python
from typing import Literal
from horus_runtime.event.base import BaseEvent

class TaskStartedEvent(BaseEvent):
    event_type: Literal["task_started"] = "task_started"

class TaskFailedEvent(BaseEvent):
    event_type: Literal["task_failed"] = "task_failed"
    error: str
```

:::info Source inference
The `source` field is automatically populated by walking the call stack to find the first frame outside of Pydantic internals. You rarely need to set it manually.
:::

## Defining Subscribers

Subscribers inherit from `BaseEventSubscriber` and must implement two abstract methods:

- `setup()`: called once during `HorusEventBus.start()`.
- `handle(event)`: called synchronously for each matching event.

Declare which event types the subscriber handles via the `events` class variable. Set it to `None` to receive **all events** (wildcard subscriber).

```python
from typing import Literal, ClassVar
from horus_runtime.event.subscriber import BaseEventSubscriber, EventFilterType
from mypackage.events import TaskFailedEvent

class FailureAlerter(BaseEventSubscriber[TaskFailedEvent]):
    subscriber_type: Literal["failure_alerter"] = "failure_alerter"
    events: ClassVar[EventFilterType] = (TaskFailedEvent,)

    def setup(self) -> None:
        # one-time initialization
        ...

    def handle(self, event: TaskFailedEvent) -> None:
        # NOTE: In real code, use the horus-runtime configured logger instead of print().
        print(f"[{event.source}] Task failed: {event.error}")
```

For a wildcard subscriber that receives every event:

```python
from typing import Literal, ClassVar
from horus_runtime.event.base import BaseEvent
from horus_runtime.event.subscriber import BaseEventSubscriber, EventFilterType

class AuditLogger(BaseEventSubscriber):
    subscriber_type: Literal["audit_logger"] = "audit_logger"
    events: ClassVar[EventFilterType] = None  # receives all events

    def setup(self) -> None:
        ...

    def handle(self, event: BaseEvent) -> None:
        # NOTE: In real code, use the horus-runtime configured logger instead of print().
        print(f"{event.timestamp} [{event.level}] {event.event_type}: {event.message}")
```

Subscribers are automatically instantiated and attached to the bus on `HorusEventBus.start()` via the plugin registry.

## Defining Transports

Transports define how events leave the process to a message broker, a remote service, a file, etc. Inherit from `BaseBusTransport` and implement three async methods:

```python
from typing import Literal
from horus_runtime.event.transport import BaseBusTransport
from horus_runtime.event.base import BaseEvent

class MyBrokerTransport(BaseBusTransport):
    transport_type: Literal["my_broker"] = "my_broker"

    async def start(self) -> None:
        # open connection, start consumers, etc.
        ...

    async def stop(self) -> None:
        # graceful shutdown
        ...

    async def publish(self, event: BaseEvent) -> None:
        payload = event.model_dump_json()
        await self._connection.publish("horus.events", payload)
```

Transport instances run exclusively on the `BusAsyncLoopThread`, the background daemon thread that owns a dedicated asyncio event loop. `publish()` is never called on the main thread.

## Registering Plugins

Transports and subscribers are discovered at startup via Python entry points:

```toml
[project.entry-points."horus.transport"]
my_broker = "mypackage.transport:MyBrokerTransport"

[project.entry-points."horus.subscriber"]
failure_alerter = "mypackage.subscribers:FailureAlerter"

[project.entry-points."horus.event"]
task_started = "mypackage.events:TaskStartedEvent"
task_failed  = "mypackage.events:TaskFailedEvent"
```

:::note Event registration is optional
In practice, you rarely need to register events via entry points. Because you emit events by importing and instantiating the class directly, the class is already available to whoever calls `emit()`. The `"horus.event"` entry point exists for cases where you want your event types to be **discoverable** by other parts of the runtime, for example, so a subscriber or tooling layer can enumerate all known event types without requiring a direct import of your package.
:::

For a complete reference on the plugin registration mechanism, see [AutoRegistry](./plugin-system/autoregistry.md).

## Summary

The Event System in Horus Runtime is:

- **Sync-first**. Safe to emit events from synchronous workflow code.
- **Asynchronous under the hood**. Transports run in a background loop.
- **Extensible**. Add new event types, subscribers, and transports easily.
- **Deterministic**. In-process subscribers are called immediately; async transports do not block workflow execution.
