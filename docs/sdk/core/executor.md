---
sidebar_position: 2
title: Executor
---

# Executor System

Executors define how a task runs once it has been dispatched to a target. A
task supplies the unit of work, the runtime prepares the payload, and the
executor is responsible for invoking that payload in a compatible way.

## Core Concept

Every executor implements an internal execution hook:

```python
async def _execute(self, task: BaseTask) -> None:
    ...
```

The task itself is responsible for orchestration concerns such as input
validation, event emission, error handling, and incrementing the run counter.
The target owns dispatch and waiting. The executor focuses on execution only.

### Contract

- Declare compatible runtime types via `runtimes`
- Implement `_execute()`, not `execute()`
- `execute()` is the public `final` entry point and runs `ExecutorMiddleware`
- Use `kind: str` as the registry discriminator

`BaseTask` validates runtime compatibility during model validation. If a task
pairs an executor with an unsupported runtime, Horus raises
`IncompatibleRuntimeError`.

## Base Executor

All executors inherit from `BaseExecutor`:

```python
class BaseExecutor(AutoRegistry, entry_point="executor"):
    registry_key: ClassVar[str] = "kind"
    kind: str
    kind_name: ClassVar[str] = "Executor"
    kind_description: ClassVar[str] = _("Base executor")
    runtimes: ClassVar[tuple[type[BaseRuntime], ...]] = (BaseRuntime,)

    @final
    async def execute(self, task: BaseTask) -> None:
        """
        Public entry point wrapped by executor middleware.
        """
        ...

    @abstractmethod
    async def _execute(self, task: BaseTask) -> None:
        """
        Subclass hook that performs execution.
        """
```

`execute()` wraps `_execute()` in `ExecutorMiddleware.call_with_middleware(...)`.
See [Middleware Overview](../plugin-system/middleware/overview.md).

### Kind metadata

Executors may expose `kind_name` and `kind_description` ClassVars to provide
human-friendly text for registries and UIs. Prefer using `horus_runtime`'s
i18n helper (`_(...)`) for `kind_description` so descriptions are translatable.

## Built-in Executors

- `ShellExecutor`: executes a `CommandRuntime`
- `PythonFunctionExecutor`: executes a `PythonFunctionRuntime` in-process by
  calling the wrapped Python function directly
- `PythonExecExecutor`: executes a `PythonCodeStringRuntime` in-process using
  `exec()`

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

## Python Code Execution Example

```python
from horus_builtin.executor.python_exec import PythonExecExecutor
from horus_builtin.runtime.python_string import PythonCodeStringRuntime
from horus_builtin.target.local import LocalTarget
from horus_builtin.task.horus_task import HorusTask

task = HorusTask(
    name="python_step",
    target=LocalTarget(),
    executor=PythonExecExecutor(),
    runtime=PythonCodeStringRuntime(
        code="with open('hello.txt', 'w', encoding='utf-8') as f:\n    f.write('hello\\n')"
    ),
)
```

`PythonExecExecutor` executes the runtime's code string in-process with
`exec()`. The execution scope includes `ctx` and `task`.

## Registering Custom Executors

To register executor plugins, expose them through:

```toml
[project.entry-points."horus.executor"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/auto-registry/autoregistry.md).
