---
sidebar_position: 7
title: Workflow
---

# Workflow System

Workflows orchestrate an ordered set of tasks.

Horus currently executes tasks in definition order. It does not perform
dependency resolution automatically, so task ordering is the workflow author's
responsibility.

## Core Concept

Every workflow implements:

```python
@classmethod
def from_yaml(cls, path: str | Path) -> Self: ...

async def run(self) -> None: ...

def reset(self) -> None: ...
```

### Contract

- `from_yaml()` loads a workflow definition
- `run()` is asynchronous
- `reset()` clears task state so the workflow can be re-run
- `kind: str` is the registry discriminator

## Base Workflow

All workflows inherit from `BaseWorkflow`:

```python
class BaseWorkflow(AutoRegistry, entry_point="workflow"):
    registry_key: ClassVar[str] = "kind"
    kind: str
    name: str
    tasks: dict[str, BaseTask] = Field(default_factory=dict)
    input: BaseInput = CLIInput()

    @classmethod
    @abstractmethod
    def from_yaml(cls, path: str | Path) -> Self:
        pass

    @abstractmethod
    async def run(self) -> None:
        pass

    @abstractmethod
    def reset(self) -> None:
        pass
```

Each task receives its `task_id` from the key used in the workflow's `tasks`
mapping.

## Built-in Workflow

- `HorusWorkflow`: runs tasks in definition order and skips tasks whose
  outputs already exist when `task.skip_if_complete` is `True`

## Example

```python
import asyncio

from horus_builtin.workflow.horus_workflow import HorusWorkflow

wf = HorusWorkflow(name="example")

asyncio.run(wf.run())
```

## Interactive Input

Workflows expose an `input` field used for interactive prompting at runtime.
The default implementation is `CLIInput`.

See [Input](./input.md) for details.

## Registering Custom Workflows

To register workflow plugins, expose them through:

```toml
[project.entry-points."horus.workflow"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/autoregistry.md).
