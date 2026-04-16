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
    orchestrator_target: BaseTarget | None = None
    status: WorkflowStatus = WorkflowStatus.IDLE

    @classmethod
    @abstractmethod
    def from_yaml(cls, path: str | Path) -> Self:
        """Load and construct a workflow from a YAML file."""

    async def transfer_artifacts(self, task: BaseTask) -> None:
        """Transfer input artifacts of task to its target before dispatch."""
        ...

    @final
    async def run(self) -> None:
        """Drives status transitions: RUNNING → COMPLETED | CANCELED | FAILED."""
        ...

    @abstractmethod
    async def _run(self) -> None:
        """Workflow-specific execution logic. Do not set self.status here."""

    @final
    def reset(self) -> None:
        """Reset status to IDLE and delegate to _reset()."""
        ...

    @abstractmethod
    def _reset(self) -> None:
        """Subclass-specific reset logic. Do not set self.status here."""
```

Subclasses must implement `from_yaml()`, `_run()`, and `_reset()`.

### `orchestrator_target`

`orchestrator_target` identifies the machine running the workflow itself. It is
used as the transfer source for **root input artifacts**: those not produced by
any upstream task in the workflow (i.e. data you provide before the workflow
starts). Must be set when the workflow dispatches tasks to remote targets that
cannot directly read local files.

Leaving it as `None` is valid for purely local workflows; the transfer layer
raises `OrchestratorTargetNotSetError` only when a remote task actually needs
a root artifact and no source is configured.

### `transfer_artifacts()`

Called by `_run()` implementations before each `task.target.dispatch(task)`. It:

1. Builds a reverse map from artifact ID → the target of the task that produced it.
2. For each input of `task`, resolves the source target (producer target, or `orchestrator_target` for root inputs).
3. Skips transfer if the destination target can already access the artifact (`access_cost()` returns non-`None`).
4. Looks up the registered `BaseTransferStrategy` for the `(source, destination)` pair.
5. Calls `strategy.transfer(artifact, source, task.target)`.

See [Transfer Strategy](./transfer.md) for details on strategies and how to implement your own.

## Built-in Workflow

- `HorusWorkflow`: runs tasks in definition order and skips tasks whose
  outputs already exist when `task.skip_if_complete` is `True`

`HorusWorkflow` sets `orchestrator_target = LocalTarget()` by default, which
means root input artifacts are expected on the local filesystem. It calls
`transfer_artifacts()` before each `task.target.dispatch(task)`, then waits
for the target to report completion before moving to the next task.

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
