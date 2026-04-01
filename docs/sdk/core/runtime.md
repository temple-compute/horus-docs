---
sidebar_position: 3
title: Runtime
---

# Runtime System

Runtimes describe what should be executed. Executors then decide how to run
that prepared value in a particular environment.

In practice, a runtime can prepare a shell command, a Python callable, a Python
code string, or any other executor-specific payload.

## Core Concept

Every runtime implements:

```python
def setup_runtime(self, task: BaseTask) -> T:
    """
    Prepare the runtime payload that an executor will consume.
    """
```

### Contract

- Return a payload of type `T` that the paired executor understands
- Use task context when needed to format or prepare the payload
- Use `kind: str` as the registry discriminator

## Base Runtime

All runtimes inherit from `BaseRuntime[T]`:

```python
class BaseRuntime[T: Any = Any](AutoRegistry, entry_point="runtime"):
    registry_key: ClassVar[str] = "kind"
    kind: str

    @abstractmethod
    def setup_runtime(self, task: BaseTask) -> T:
        pass
```

The generic return type is intentionally flexible. This allows Horus runtimes
to return more than strings, such as Python callables for in-process execution.

## Built-in Runtimes

- `CommandRuntime`: formats and returns a shell command string
- `PythonFunctionRuntime`: stores a Python callable and returns it unchanged
- `PythonCodeStringRuntime`: returns a Python code string for in-process
  execution with `exec()`

## Example

```python
from horus_builtin.runtime.command import CommandRuntime

runtime = CommandRuntime(
    command="cp {input_file.path} {task.name}.bak",
)
```

`CommandRuntime` formats placeholders from:

- `task`
- declared input artifacts
- declared output artifacts
- `task.variables`

## Python-Native Runtime Examples

```python
from horus_builtin.runtime.python import PythonFunctionRuntime
from horus_builtin.runtime.python_string import PythonCodeStringRuntime

runtime1 = PythonFunctionRuntime(func=lambda: print("hello from python"))

runtime2 = PythonCodeStringRuntime(
    code="result = 1 + 1\nprint(result)"
)
```

## Registering Custom Runtimes

To register runtime plugins, expose them through:

```toml
[project.entry-points."horus.runtime"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/autoregistry.md).
