---
sidebar_position: 5
title: Task
---

# Task System

Tasks are the unit of work in Horus. A task binds together its input and output
artifacts, runtime, executor, target, and optional interaction transport.

## Core Concept

Every task must implement all three abstract methods:

```python
async def _run(self) -> None:
    ...

def is_complete(self) -> bool:
    ...

def _reset(self) -> None:
    ...
```

### Contract

- `_run()`: task-specific execution logic; do not mutate `status` here
- `is_complete()`: return `True` when all output artifacts are present and valid; used to skip already-complete tasks when `skip_if_complete=True`
- `_reset()`: clear any subclass-specific state so the task can re-run; do not mutate `status` here
- `run()` is the public `final` entry point and runs `TaskMiddleware`
- `kind: str` is the registry discriminator
- `executor` and `runtime` must be compatible
- `target` decides where the task is dispatched
- `interaction` can carry a task-level runtime prompt transport

Runtime compatibility is validated automatically after model construction. An
invalid executor/runtime pair raises `IncompatibleRuntimeError`.

## Base Task

All tasks inherit from `BaseTask`:

```python
class BaseTask(AutoRegistry, entry_point="task"):
    registry_key: ClassVar[str] = "kind"
    kind: str
    kind_name: ClassVar[str] = "Task"
    kind_description: ClassVar[str] = _("Base task")
    id: str
    name: str
    inputs: dict[str, BaseArtifact] = Field(default_factory=dict)
    outputs: dict[str, BaseArtifact] = Field(default_factory=dict)
    executor: BaseExecutor
    runtime: BaseRuntime
    target: BaseTarget
    status: TaskStatus = TaskStatus.IDLE
    runs: int = 0
    skip_if_complete: bool = True
    interaction: BaseInteractionTransport | None = None

    @final
    async def run(self) -> None:
        """Drives status transitions: RUNNING → COMPLETED | CANCELED | FAILED."""
        ...

    async def sync_status(self) -> TaskStatus:
        """Refresh self.status from the target and return the updated value."""
        ...

    @abstractmethod
    async def _run(self) -> None:
        """Task-specific execution logic. Do not set self.status here."""

    @abstractmethod
    def is_complete(self) -> bool:
        """Return True when output artifacts are present and valid."""

    @final
    def reset(self) -> None:
        """Reset status to IDLE and delegate to _reset()."""
        ...

    @abstractmethod
    def _reset(self) -> None:
        """Subclass-specific reset logic. Do not set self.status here."""
```

Subclasses must implement `_run()`, `is_complete()`, and `_reset()`.

### Kind metadata

Registry-backed classes (tasks, targets, runtimes, executors, workflows)
now expose two optional ClassVar fields that provide human-friendly metadata
for client UIs and registries:

- `kind_name: ClassVar[str]` — a short, human-readable name for the kind.
- `kind_description: ClassVar[str]` — a longer description string. Prefer
    using a plugin-scoped translator created with `make_translator` (aliased
    as `_`) for translations; see the [SDK i18n guide](../i18n/index.md), e.g.:

```python
from your_plugin.i18n import tr as _

class HorusTask(BaseTask):
        kind: str = "horus_task"
        kind_name: ClassVar[str] = "Horus Task"
        kind_description: ClassVar[str] = _("Basic Horus task")
```

`run()` wraps `_run()` in `TaskMiddleware.call_with_middleware(...)` and owns
all status transitions.

## Built-in Tasks

- `HorusTask`: the standard task implementation for command-style execution
- `FunctionTask`: a code-first task that wraps a Python function and pairs it
  with `PythonFunctionRuntime` and `PythonFunctionExecutor`

## `HorusTask`

`HorusTask` provides the default task behavior:

- emits task lifecycle events
- validates that declared input artifacts exist before execution
- delegates execution to the configured executor
- treats a task as complete when all declared output artifacts exist

The default `HorusTask.target` is `LocalTarget`, so tasks run in-process unless
you provide a different target.

If a task declares no outputs, `HorusTask.is_complete()` returns `False`, so the
task always runs unless your workflow adds different logic.

## `FunctionTask`

`FunctionTask` is the simplest way to build an in-memory workflow in Python:

```python
@FunctionTask.task(wf)
def prepare_data() -> None:
    ...
```

The decorator creates a `FunctionTask`, wraps the function in a
`PythonFunctionRuntime`, and registers the task in the workflow automatically.
Function parameters are injected by name: `task` is available directly, and
other parameters are matched against keys in declared `inputs` and declared
`outputs`.

It also defaults `interaction` to the built-in CLI transport, which makes
interactive code-first tasks easy to author.

See [FunctionTask](./function-task.md) for the full guide and examples.

## Registering Custom Tasks

To register task plugins, expose them through:

```toml
[project.entry-points."horus.task"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/auto-registry/autoregistry.md).
