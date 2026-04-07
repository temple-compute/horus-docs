---
sidebar_position: 4
title: Task
---

# Task System

Tasks are the unit of work in Horus. A task binds together its input and output
artifacts, execution variables, executor, and runtime.

## Core Concept

Every task implements:

```python
async def run(self) -> None:
    """
    Execute the task.
    """
```

Tasks also define completion and reset semantics:

```python
def is_complete(self) -> bool: ...
def reset(self) -> None: ...
```

### Contract

- `run()` is asynchronous
- `is_complete()` determines whether the task can be skipped
- `reset()` clears task outputs so the task can run again
- `kind: str` is the registry discriminator
- `executor` and `runtime` must be compatible
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
    runs: int = 0
    skip_if_complete: bool = True
    interaction: BaseInteractionTransport | None = None

    @abstractmethod
    async def run(self) -> None:
        pass

    @abstractmethod
    def is_complete(self) -> bool:
        pass

    @abstractmethod
    def reset(self) -> None:
        pass
```

## Built-in Tasks

- `HorusTask`: the standard task implementation for command-style execution
- `FunctionTask`: a code-first task that wraps a Python function and pairs it
  with `PythonFunctionRuntime` and `PythonFunctionExecutor`

## `HorusTask`

`HorusTask` provides the default task behavior:

- Emits task start and completion events
- Validates that declared input artifacts exist before execution
- Delegates execution to the configured executor
- Raises `TaskExecutionError` on non-zero return codes
- Treats a task as complete when all declared output artifacts exist

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
Function parameters are injected by name from `task`, declared `inputs`,
declared `outputs`, and `variables`.

It also defaults `interaction` to the built-in CLI transport, which makes
interactive code-first tasks easy to author.

See [FunctionTask](./function-task.md) for the full guide and examples.

## Registering Custom Tasks

To register task plugins, expose them through:

```toml
[project.entry-points."horus.task"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/autoregistry.md).
