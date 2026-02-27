---
sidebar_position: 3
title: Runtime
---

# Runtime System

Runtimes prepare the commands that tasks will execute, while executors provide the environment and context in which those commands run. They separate the execution context (how/where to run - executors) from the command preparation (what command to run - runtimes).

## Core Concept

Every runtime implements:

```python
def _setup_runtime(self, task: BaseTask) -> str:
    """
    Prepare runtime for execution, return formatted command/context
    """
```

The workflow engine uses runtimes to prepare commands for executors. Runtimes handle variable substitution and context formatting.

### Contract

- Return a formatted command/context string
- Use task variables, inputs, and outputs for substitution
- Subclasses override `_setup_runtime` to produce the raw command/context; `format_runtime` applies variable substitution

## Built-in Runtimes

The SDK provides a standard runtime implementation:

- `CommandRuntime` - Accepts a shell script as input. Returns the specified script after formatting.

## Base Runtime

All runtimes inherit from `BaseRuntime`:

```python
class BaseRuntime(BaseModel, ABC, AutoRegistry):
    registry_key: ClassVar[str] = "kind"
    kind: Any = None

    @abstractmethod
    def _setup_runtime(self, task: BaseTask) -> str:
        pass

    def format_runtime(self, task: BaseTask) -> str:
        cmd = self._setup_runtime(task)

        fmt_kwargs = {} # Populated from task variables, inputs, and outputs

        # Substitutes variables, inputs, outputs
        return cmd.format(**fmt_kwargs)
```

## Registering custom runtimes

To register and discover runtime plugins within the Horus runtime, use the following entry point:

```toml
[project.entry-points."horus.runtimes"]
```

For more details, refer to the [AutoRegistry documentation](../plugin-system/autoregistry.md).
