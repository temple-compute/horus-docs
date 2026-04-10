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

    @property
    @abstractmethod
    def location_id(self) -> str:
        pass

    @abstractmethod
    async def dispatch(self, task: BaseTask) -> None:
        pass

    @abstractmethod
    async def wait(self) -> None:
        pass

    @abstractmethod
    async def cancel(self) -> None:
        pass

    @abstractmethod
    async def get_status(self) -> TaskStatus:
        pass

    @abstractmethod
    def access_cost(self, artifact: BaseArtifact) -> float | None:
        pass

    async def recover(self) -> bool:
        return False
```

### Contract

- `location_id` identifies the physical or logical location of execution
- `dispatch()` starts the task on that location
- `wait()` waits for completion
- `cancel()` attempts cancellation
- `get_status()` reports current task status
- `access_cost()` estimates whether the target can read an artifact directly
- `recover()` optionally reconnects to work after orchestrator restart

`location_id` is especially important for artifact movement. Two targets with
the same location can often share a filesystem, which means Horus may avoid
copying artifacts between them.

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
