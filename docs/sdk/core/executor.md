---
sidebar_position: 2
title: Executor
---

# Executor System

Executors define how a task runs once it has been dispatched to a target. A
task supplies the unit of work, the runtime prepares the payload, and the
executor is responsible for invoking that payload in a compatible way.

## Core Concept

Every executor implements:

```python
async def execute(self, task: BaseTask) -> int:
    ...
```

The task itself is responsible for orchestration concerns such as input
validation, event emission, error handling, and incrementing the run counter.
The target owns dispatch and waiting. The executor focuses on execution only.

### Contract

- Return `0` on success
- Return non-zero on task failure
- Declare compatible runtime types via `runtimes`
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
    runtimes: ClassVar[tuple[type[BaseRuntime], ...]] = (BaseRuntime,)

    @abstractmethod
    async def execute(self, task: BaseTask) -> int:
        pass
```

## Built-in Executors

- `ShellExecutor`: executes a `CommandRuntime` with `subprocess.run(..., shell=True)`
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

For more details, refer to the [Auto-Registry documentation](../plugin-system/autoregistry.md).
