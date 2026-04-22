---
sidebar_position: 3
title: Writing Middleware
---

# Writing Middleware

Most middleware can be written by overriding `before()` and `after()`.

## `before()` / `after()` Style

```python
from horus_runtime.middleware.workflow import (
    WorkflowMiddleware,
    WorkflowMiddlewareContext,
)


class WorkflowAuditMiddleware(WorkflowMiddleware):
    async def before(self, context: WorkflowMiddlewareContext) -> None:
        print(f"workflow {context.workflow.name} starting")

    async def after(self, context: WorkflowMiddlewareContext) -> None:
        print(f"workflow {context.workflow.name} ended")
```

## Overriding `wrap()`

Override `wrap()` when you need full control around the next call.

```python
from collections.abc import Awaitable, Callable

from horus_runtime.middleware.executor import (
    ExecutorMiddleware,
    ExecutorMiddlewareContext,
)


class RetryExecutorMiddleware(ExecutorMiddleware):
    async def wrap(
        self,
        context: ExecutorMiddlewareContext,
        call_next: Callable[[], Awaitable[None]],
    ) -> None:
        del context
        last_error: Exception | None = None
        for _ in range(3):
            try:
                await call_next()
                return
            except RuntimeError as exc:
                last_error = exc
        assert last_error is not None
        raise last_error
```

Use a custom `wrap()` for retries, timeouts, exception translation, or
short-circuiting.

## Registering Middleware Plugins

Expose middleware through the appropriate entry point group:

```toml
[project.entry-points."horus.middleware.task"]
task_timing = "my_plugin.middleware.task"

[project.entry-points."horus.middleware.executor"]
executor_retry = "my_plugin.middleware.executor"
```

The group name must match the middleware root's domain.

## Practical Guidelines

- Override the internal core hooks in your main implementations, not the public wrapper methods.
- Use middleware for cross-cutting concerns that should apply to many implementations.
- Prefer `before()` and `after()` unless you truly need custom control flow.
- Keep middleware idempotent when possible, especially if you add retry logic.
