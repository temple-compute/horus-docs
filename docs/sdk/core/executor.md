---
sidebar_position: 2
title: Executor
---

# Executor System

Executors define where and how a task runs. A task supplies the unit of work,
and the executor is responsible for actually running it against a compatible
runtime.

## Core Concept

Every executor implements:

```python
def execute(self, task: BaseTask) -> int:
    """
    Execute the given task and return an exit code.
    """
```

The task itself is responsible for orchestration concerns such as input
validation, event emission, error handling, and incrementing the run counter.
The executor focuses on execution only.

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
    def execute(self, task: BaseTask) -> int:
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
from horus_builtin.task.horus_task import HorusTask

task = HorusTask(
    name="echo",
    executor=ShellExecutor(),
    runtime=CommandRuntime(command="echo 'hello world'"),
)
```

## Python Code Execution Example

```python
from horus_builtin.executor.python_exec import PythonExecExecutor
from horus_builtin.runtime.python_string import PythonCodeStringRuntime
from horus_builtin.task.horus_task import HorusTask

task = HorusTask(
    name="python_step",
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
