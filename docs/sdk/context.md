---
id: runtime-context
slug: /sdk/context
sidebar_position: 4
title: Horus Context
---

# Runtime Context

`HorusContext` is the global runtime context for the Horus Runtime SDK. It is responsible for initializing the runtime environment, loading plugins, and exposing shared runtime state, including the [Event Bus](./event_system.md), to all other components.

The context is stored in a `ContextVar` and can be accessed from anywhere in the current execution flow, including task implementations.

## Lifecycle

The runtime must be explicitly started and stopped. Both operations emit lifecycle events on the bus so subscribers can react.

### `boot()`

Initializes the runtime. Must be called before using any other `horus-runtime` features.

```python
from horus_runtime.context import HorusContext

ctx = HorusContext.boot()
```

`boot()` performs the following steps in order:

1. Instantiates `HorusContext` with a new `HorusEventBus`.
2. Calls `AutoRegistry.init_registry()` to discover and load all registered plugins.
3. Calls `bus.start()` to instantiate transports and subscribers.
4. Sets the context as the active `ContextVar`.
5. Emits `HorusRuntimeReadyEvent` so plugins can react to the runtime being fully initialized.

### `shutdown()`

Gracefully tears down the runtime.

```python
ctx.shutdown()
```

`shutdown()` performs the following steps in order:

1. Emits `HorusRuntimeWillShutdownEvent` so subscribers can react before transports stop.
2. Calls `bus.stop()` to await all transport shutdown coroutines and stop the background async loop.

## Lifecycle Events

`HorusContext` emits two built-in events during its lifecycle:

| Event                           | `event_type`                    | When                                                              |
| ------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| `HorusRuntimeReadyEvent`        | `"horus_runtime_ready"`         | After `boot()` completes. Bus is running, all plugins are loaded. |
| `HorusRuntimeWillShutdownEvent` | `"horus_runtime_will_shutdown"` | At the start of `shutdown()`. Before any transport is stopped.    |

Both inherit from `HorusContextEvent`, which itself inherits from `BaseEvent`. You can subscribe to either specifically or to `HorusContextEvent` to handle both:

```python
from typing import Literal, ClassVar
from horus_runtime.context import HorusRuntimeReadyEvent, HorusRuntimeWillShutdownEvent
from horus_runtime.event.subscriber import BaseEventSubscriber, EventFilterType

class LifecycleSubscriber(BaseEventSubscriber):
    subscriber_type: Literal["lifecycle"] = "lifecycle"
    events: ClassVar[EventFilterType] = (HorusRuntimeReadyEvent, HorusRuntimeWillShutdownEvent)

    def setup(self) -> None:
        ...

    def handle(self, event) -> None:
        if isinstance(event, HorusRuntimeReadyEvent):
            # Runtime is ready. Initialize your resources here.
        elif isinstance(event, HorusRuntimeWillShutdownEvent):
            # Runtime shutting down. Release your resources here.
```

## Accessing the Context

```python
from horus_runtime.context import HorusContext

ctx = HorusContext.get_context()
```

Returns the active `HorusContext` instance. Raises a `LookupError` if called before `boot()`.

## Using the Context Inside Tasks

```python
from horus_runtime.context import HorusContext
from horus_runtime.core.task.base import BaseTask

class MyTask(BaseTask):
    kind: str = "my_task"

    async def _run(self) -> None:
        ctx = HorusContext.get_context()
        ctx.bus.emit(MyEvent(message="task started"))
```

No explicit dependency injection is needed, the context is available anywhere within the active execution scope.
