---
sidebar_position: 4
title: Target
---

# Target System

Targets describe where a task runs.

This abstraction separates placement from execution strategy. The same runtime
and executor pair may be valid on multiple locations, while the target decides
whether the task runs locally, on a remote agent, on a cloud node, or on some
other execution host.

## Why Targets Exist

Before targets, it is tempting to make executors responsible for both
placement and execution. That works for simple local runs, but it couples two
different concerns:

- placement: choosing the machine, agent, or environment boundary
- execution: deciding how the prepared runtime payload is invoked there

With `BaseTarget`, Horus can dispatch a task to a location first, then let the
task's executor run the task using its configured runtime on that location.

In short:

- `Runtime` prepares the payload
- `Executor` consumes that payload
- `Target` owns dispatch, waiting, cancellation, and status probing

## Base Target

All targets inherit from `BaseTarget`:

```python
class BaseTarget(AutoRegistry, entry_point="target"):
    registry_key: ClassVar[str] = "kind"
    kind: str
    kind_name: ClassVar[str] = "Target"
    kind_description: ClassVar[str] = _("Base target")
    working_directory: Path = Field(default_factory=Path.cwd)

    @property
    @abstractmethod
    def location_id(self) -> str:
        ...

    @final
    async def dispatch(self, task: BaseTask) -> None:
        ...

    @abstractmethod
    async def _dispatch(self, task: BaseTask) -> None:
        ...

    @abstractmethod
    async def wait(self) -> None:
        ...

    @abstractmethod
    async def cancel(self) -> None:
        ...

    @abstractmethod
    async def get_status(self) -> TaskStatus:
        ...

    @abstractmethod
    def access_cost(self, artifact: BaseArtifact) -> float | None:
        ...

    async def recover(self) -> bool:
        return False
```

### Contract

- `location_id`: stable URI-like identifier for the physical location
- `working_directory`: base directory on the target host where per-task working directories are created
- `dispatch()`: public `@final` entry point. Sets `task.status = PENDING`, runs `TargetMiddleware`, and delegates to `_dispatch()`
- `_dispatch()`: the implementation hook. Start the task on the target here
- `wait()`: block until the dispatched task completes
- `cancel()`: attempt cancellation of a running task
- `get_status()`: return the current `TaskStatus` of the dispatched task
- `access_cost()`: estimate the cost of reading an artifact from this target
- `recover()`: optionally reconnect to a previously dispatched task after orchestrator restart

`location_id` feeds directly into the transfer system. Two targets with the same
`location_id` share a filesystem, so the workflow can skip artifact copies
between them.

Only `dispatch()` is middleware-wrapped today. `wait()`, `cancel()`, and
`get_status()` remain direct target methods.

### Kind metadata

Targets may expose `kind_name` and `kind_description` ClassVars to provide
human-friendly names and descriptions for registries and UIs. To make
descriptions translatable, use your plugin's own translator created with
`make_translator` (typically aliased as `_`) rather than importing
`horus_runtime`'s internal translator. See [SDK i18n guide](../i18n/index.md) for the
recommended pattern.

## Built-in Target

- `LocalTarget`: dispatches the task into the current process event loop

`LocalTarget` is the default target for `HorusTask`. It reports a stable
`location_id` like `local://hostname`, runs the task asynchronously, and
returns `0.0` access cost for local file artifacts that already exist.

## Example

```python
from horus_builtin.executor.shell import ShellExecutor
from horus_builtin.runtime.command import CommandRuntime
from horus_builtin.target.local import LocalTarget
from horus_builtin.task.horus_task import HorusTask

task = HorusTask(
    name="echo",
    target=LocalTarget(),
    executor=ShellExecutor(),
    runtime=CommandRuntime(command="echo 'hello world'"),
)
```

When a workflow runs this task, it dispatches the task to `task.target`, then
waits for that target to report completion.

## Registering Custom Targets

To register target plugins, expose them through:

```toml
[project.entry-points."horus.target"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/auto-registry/autoregistry.md).
