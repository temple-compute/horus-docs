---
sidebar_position: 5
title: Task
---

# Task System

Tasks are the unit of work in Horus. A task binds together its input and output
artifacts, execution variables, runtime, executor, and target.

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
    task_id: str | None = None
    name: str
    inputs: dict[str, BaseArtifact] = Field(default_factory=dict)
    outputs: dict[str, BaseArtifact] = Field(default_factory=dict)
    variables: dict[str, Any] = Field(default_factory=dict)
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

## Built-in Tasks

- `HorusTask`: the standard task implementation for command-style execution
- `FunctionTask`: a code-first task that wraps a Python function and pairs it
  with `PythonFunctionRuntime` and `PythonFunctionExecutor`

## `HorusTask`

`HorusTask` provides the default task behavior:

- Emits task start and completion events
- Validates that declared input artifacts exist before execution
- Delegates placement to the configured target
- Delegates execution to the configured executor once running on that target
- Raises `TaskExecutionError` on non-zero return codes
- Treats a task as complete when all declared output artifacts exist

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
Function parameters are injected by name: `task` is available directly (positional argument), and
other parameters are matched against keys (keyword arguments) in declared `inputs`, declared
`outputs`, and `task.variables`.

It also defaults `interaction` to the built-in CLI transport, which makes
interactive code-first tasks easy to author.

See [FunctionTask](./function-task.md) for the full guide and examples.

## Registering Custom Tasks

To register task plugins, expose them through:

```toml
[project.entry-points."horus.task"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/autoregistry.md).
