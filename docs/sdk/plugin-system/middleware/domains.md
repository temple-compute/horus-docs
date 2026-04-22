---
sidebar_position: 2
title: Middleware Domains
---

# Middleware Domains

Each middleware root receives a different context object. Those context models
define what a middleware can inspect or mutate.

## Task Middleware

```python
@dataclass
class TaskMiddlewareContext:
    task: BaseTask
```

Entered by `BaseTask.run()`.

## Workflow Middleware

```python
@dataclass
class WorkflowMiddlewareContext:
    workflow: BaseWorkflow
```

Entered by `BaseWorkflow.run()`.

## Runtime Middleware

```python
@dataclass
class RuntimeMiddlewareContext:
    runtime: BaseRuntime
    task: BaseTask
```

Entered by `BaseRuntime.setup_runtime()`.

## Executor Middleware

```python
@dataclass
class ExecutorMiddlewareContext:
    executor: BaseExecutor
    task: BaseTask
```

Entered by `BaseExecutor.execute()`.

## Target Middleware

```python
@dataclass
class TargetMiddlewareContext:
    target: BaseTarget
    task: BaseTask | None = None
```

Entered by `BaseTarget.dispatch()`.

Today, middleware wraps dispatch only. The optional `task` field leaves room
for reuse by other target operations in the future.

## Transfer Middleware

```python
@dataclass
class TransferMiddlewareContext:
    transfer_strategy: BaseTransferStrategy[Any, Any]
    artifact: BaseArtifact
    source: BaseTarget
    destination: BaseTarget
```

Entered by `BaseTransferStrategy.transfer()`.

## Interaction Middleware

```python
@dataclass
class InteractionMiddlewareContext:
    transport: BaseInteractionTransport
    interaction: BaseInteraction
    renderer: BaseInteractionRenderer[Any, Any]
    attempt: int
```

Entered by `BaseInteractionTransport.ask()` once per render attempt.

This context is intentionally mutable. Middleware can replace the transport,
interaction, or renderer before the render call happens.

## Built-in Middleware

Horus currently ships two built-in middleware implementations:

- `TaskTimeMiddleware`
- `WorkflowTimeMiddleware`

Both record elapsed wall-clock time and emit timing information on the event
bus after execution completes.
