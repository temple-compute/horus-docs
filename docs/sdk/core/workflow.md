---
sidebar_position: 8
title: Workflow
---

# Workflow System

Workflows orchestrate an ordered set of tasks.

Horus currently executes tasks in definition order. It does not perform
dependency resolution automatically, so task ordering is the workflow author's
responsibility.

## Core Concept

Every workflow must implement all three abstract methods:

```python
@classmethod
def from_yaml(cls, path: str | Path) -> Self:
    ...

async def _run(self) -> None:
    ...

def _reset(self) -> None:
    ...
```

### Contract

- `from_yaml()`: load and construct a workflow from a YAML file
- `_run()`: workflow-specific execution logic; do not mutate `status` here
- `_reset()`: subclass-specific reset logic; do not mutate `status` here
- `kind: str` is the registry discriminator

## Base Workflow

All workflows inherit from `BaseWorkflow`:

```python
class BaseWorkflow(AutoRegistry, entry_point="workflow"):
    registry_key: ClassVar[str] = "kind"
    kind: str
    name: str
    tasks: dict[str, BaseTask] = Field(default_factory=dict)
    status: WorkflowStatus = WorkflowStatus.IDLE

    @classmethod
    @abstractmethod
    def from_yaml(cls, path: str | Path) -> Self:
        """
        Load and construct a workflow from a YAML file.
        """

    @final
    async def run(self) -> None:
        """
        Drives status transitions: RUNNING → COMPLETED | CANCELED | FAILED.
        """
        ...

    @abstractmethod
    async def _run(self) -> None:
        """Workflow-specific execution logic. Do not set self.status here."""

    @final
    def reset(self) -> None:
        """
        Reset status to IDLE and delegate to _reset().
        """
        ...

    @abstractmethod
    def _reset(self) -> None:
        """
        Subclass-specific reset logic. Do not set self.status here.
        """
```

Subclasses must implement `from_yaml()`, `_run()`, and `_reset()`.

## Built-in Workflow

- `HorusWorkflow`: runs tasks in definition order and skips tasks whose
  outputs already exist when `task.skip_if_complete` is `True`

`HorusWorkflow` dispatches each task through `task.target`, then waits for that
target to report completion before moving to the next task.

## Example

```python
import asyncio

from horus_builtin.workflow.horus_workflow import HorusWorkflow

wf = HorusWorkflow(name="example")

asyncio.run(wf.run())
```

## Task IDs

Each task receives its `task_id` from the key used in the workflow's `tasks`
mapping. This keeps task IDs aligned with workflow registration keys.

## Registering Custom Workflows

To register workflow plugins, expose them through:

```toml
[project.entry-points."horus.workflow"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/autoregistry.md).
