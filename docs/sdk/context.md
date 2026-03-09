---
id: runtime-context
slug: /sdk/context
sidebar_position: 4
title: Horus Context
---

# Runtime Context

`HorusContext` is the global runtime context for the Horus Runtime SDK.  
It is responsible for initializing the runtime environment, loading plugins, and exposing shared runtime state to the system.

The runtime context can be accessed from anywhere in the execution flow, including **task implementations**, allowing them to interact with the active workflow, loaded plugins, and other runtime services.

## Responsibilities

`HorusContext` currently handles:

- Runtime initialization
- Plugin discovery and registration
- Global context management

In the future, it will also provide:

- Workflow execution context
- Event system access
- Runtime-level services and shared state

## Accessing the Runtime Context

The runtime context is stored internally using Python `ContextVar`. This allows the runtime to be safely accessed from anywhere in the current execution context.

To retrieve the active runtime:

```python
from horus_runtime.context import HorusContext

ctx = HorusContext.get_context()
```

This method returns the currently active `HorusContext` instance.

## Using the Runtime Inside Tasks

Task implementations can access the runtime context to interact with runtime services.

Example:

```python
from horus_runtime.context import HorusContext

class MyTask(BaseTask):

    def run(self):
        ctx = HorusContext.get_context()
        # Access HorusContext services here
```

This allows tasks to interact with the Horus environment without requiring explicit dependency injection.
