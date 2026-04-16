---
sidebar_position: 4
title: Target
---

# Target System

Targets describe where a task runs.

This abstraction exists to separate placement from execution strategy.
That distinction matters once Horus grows beyond a single local process. The
same runtime and executor pair may be valid on multiple locations, while the
target decides whether the task runs locally, on a remote agent, on a cloud
node, or on another execution host.

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
    working_directory: Path = Path(getcwd())

    @property
    @abstractmethod
    def location_id(self) -> str:
        ...

    @final
    async def dispatch(self, task: BaseTask) -> None:
        # sets task.status = PENDING, then calls _dispatch()
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

- `location_id`: stable URI-like identifier for the physical location (e.g. `local://hostname`). Two targets that share a filesystem should return the same value; the transfer layer uses this to skip unnecessary copies.
- `working_directory`: base directory on the target host where per-task working directories are created. Defaults to the current working directory.
- `dispatch()`: public entry point, `@final`. Sets `task.status = PENDING` and delegates to `_dispatch()`. Do not override this.
- `_dispatch()`: the implementation hook. Start the task on the target here.
- `wait()`: block until the dispatched task completes.
- `cancel()`: attempt cancellation of a running task.
- `get_status()`: return the current `TaskStatus` of the dispatched task.
- `access_cost()`: estimate the cost of reading an artifact from this target:
  - `0.0`: zero-cost local read (same filesystem or in-memory)
  - `> 0.0`: accessible but non-free (network, agent API, …)
  - `None`: not accessible; a transfer is required before dispatch
- `recover()`: optionally reconnect to a previously dispatched task after orchestrator restart. Returns `False` by default.

`location_id` feeds directly into the transfer system. Two targets with the same
`location_id` share a filesystem, so the workflow can skip artifact copies between
them.

## Built-in Target

- `LocalTarget`: dispatches the task into the current process event loop

`LocalTarget` is the default target for `HorusTask`. It reports a stable
`location_id` like `local://hostname`, runs the task asynchronously, and
returns `0.0` access cost for local file artifacts.

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

For more details, refer to the [Auto-Registry documentation](../plugin-system/autoregistry.md).
