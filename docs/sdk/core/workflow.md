---
sidebar_position: 8
title: Workflow
---

# Workflow System

Workflows orchestrate a set of tasks connected as a **directed acyclic graph
(DAG)**.

Tasks are not executed in definition order. Instead, Horus derives the
execution order from the data dependencies between tasks: a task that consumes
an artifact produced by another task automatically runs after it. The workflow
author declares *what* each task consumes and produces; the runtime works out
*when* each task runs (see [DAG planning](#dag-planning)).

## Core Concept

Every workflow must implement all three abstract methods:

```python
@classmethod
def from_yaml(cls, path: str | Path) -> Self:
    ...

async def _run(self, trigger_id: str) -> None:
    ...

def _reset(self) -> None:
    ...
```

### Contract

- `from_yaml()`: load and construct a workflow from a YAML file
- `_run(trigger_id)`: workflow-specific execution logic; do not mutate `status` here
- `_reset()`: subclass-specific reset logic; do not mutate `status` here
- `run(trigger_id)` is the public `final` entry point and runs `WorkflowMiddleware`
- `kind: str` is the registry discriminator

## Base Workflow

All workflows inherit from `BaseWorkflow`:

```python
class BaseWorkflow(AutoRegistry, entry_point="workflow"):
    registry_key: ClassVar[str] = "kind"
    kind: str
    kind_name: ClassVar[str] = "Workflow"
    kind_description: ClassVar[str] = _("Base workflow")
    name: str
    tasks: list[BaseTask] = Field(default_factory=list)
    artifacts: list[BaseArtifact] = Field(default_factory=list)
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
    async def run(self, trigger_id: str) -> None:
        """Drives status transitions: RUNNING → COMPLETED | CANCELED | FAILED."""
        ...

    @abstractmethod
    async def _run(self, trigger_id: str) -> None:
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

`run(trigger_id)` wraps `_run(trigger_id)` in
`WorkflowMiddleware.call_with_middleware(...)` and owns the workflow status
transitions.

### `tasks`

`tasks` is a **list** of `BaseTask` instances. Each task carries its own `id`
(see [Task IDs](#task-ids)); the runtime keys tasks by that `id` internally, so
the list order is not what determines execution order: the DAG does.

### `artifacts`

`artifacts` is a list of **root artifacts**: artifacts that exist before the
workflow runs and are not produced by any task (for example a dataset file or a
user upload). Tasks consume them by declaring an input artifact whose `id`
matches a root artifact's `id`.

Root artifacts have no producer, so during DAG planning they become the entry
points of the graph, and the transfer layer treats them as coming from
`orchestrator_target`.

### Kind metadata

Workflows may declare `kind_name` and `kind_description` ClassVars to make
registry entries more discoverable. Use your plugin's translator (created via
`make_translator` and commonly aliased as `_(...)`) for translatable
descriptions.

### `orchestrator_target`

`orchestrator_target` identifies the machine running the workflow itself. It is
used as the transfer source for root input artifacts: those not produced by
any upstream task in the workflow.

Leaving it as `None` is valid for purely local workflows. The transfer layer
raises `OrchestratorTargetNotSetError` only when a task actually needs a root
artifact from a source that has not been configured.

### `transfer_artifacts()`

Called by `_run()` implementations before each `task.target.dispatch(task)`. It:

1. builds a reverse map from output artifact ID to the target of the task that produced it
2. resolves the source target for each input artifact
3. looks up the registered `BaseTransferStrategy` for the `(source, destination)` pair
4. calls `strategy.transfer(artifact, source, task.target)`

See [Transfer Strategy](./transfer.md) for details.

## Built-in Workflow

- `HorusWorkflow`: builds the DAG from task inputs/outputs, computes an
  execution plan from the trigger, and runs tasks in dependency order, skipping
  tasks whose outputs already exist when `task.skip_if_complete` is `True`

`HorusWorkflow` sets `orchestrator_target = LocalTarget()` by default. For each
task in the computed plan it calls `transfer_artifacts()` before
`task.target.dispatch(task)`, then waits for the target to report completion
before moving to the next task.

## Example

`run()` requires a `trigger_id`: the `id` of the task that initiates the run.
The runtime plans the DAG around that task (see [DAG planning](#dag-planning)).

```python
import asyncio

from horus_builtin.workflow.horus_workflow import HorusWorkflow

wf = HorusWorkflow(name="example", tasks=[...])

# Run the workflow, triggered by the task whose id is "final_step".
asyncio.run(wf.run(trigger_id="final_step"))
```

## Task IDs

Each task owns an explicit `id`. Task IDs must be **unique** within a workflow,
they are the handles used for dependency resolution, for selecting a trigger,
and for keying tasks internally.

Uniqueness is enforced at construction time by a model validator: a workflow
with two tasks sharing an `id` raises `TaskIdsAreNotUniqueError`. Output
artifact IDs must likewise be unique across all tasks and root artifacts, or
`ArtifactIdsAreNotUniqueError` is raised.

## DAG planning

A workflow is a directed acyclic graph where **nodes are tasks** and **edges
are artifacts**. The graph is derived entirely from the artifact IDs declared
on each task.

### How dependencies are derived

1. **Producers.** Every output artifact maps to the task that declares it:
   `artifact_id -> task_id`. Output artifact IDs must be unique, so each
   artifact has at most one producer.
2. **Dependencies.** For each task, every input artifact whose `id` matches
   another task's output artifact creates an edge: the consuming task depends on
   the producing task. Input artifacts with no producer are **root inputs**
   (declared in the workflow's `artifacts` list, or otherwise present on disk);
   they create no edge.
3. **Ordering.** The resulting graph is sorted topologically (Kahn's algorithm,
   with ties broken deterministically by id) to produce the execution order.

If the inputs and outputs form a cycle, planning fails with
`CyclicDependencyError`.

### Trigger IDs

Every run is initiated by a **trigger**: the `id` of one task in the workflow,
passed to `run(trigger_id=...)`. The trigger scopes which tasks run, a workflow
rarely needs to execute its entire graph on every run.

Given a trigger, the execution plan is the trigger task plus:

- its **ancestors**: every upstream task needed to produce the trigger's
  inputs, walked transitively; and
- its **descendants**: every downstream task that (directly or transitively)
  consumes the trigger's outputs.

Unrelated branches of the graph are excluded entirely. Within that scope, tasks
still run in topological order, and any ancestor whose outputs already exist is
skipped at run time via `is_complete()` (when `skip_if_complete` is `True`), so
upstream work is not redundantly recomputed.

Passing a `trigger_id` that does not correspond to a task in the workflow raises
`UnknownTaskError` (from `execution_plan`). `HorusWorkflow._run` likewise rejects
an unknown trigger before planning.

> To execute the full graph in topological order, the underlying
> `execution_plan(tasks, trigger_id=None)` accepts `None` as the trigger and
> falls back to the complete DAG.

## Registering Custom Workflows

To register workflow plugins, expose them through:

```toml
[project.entry-points."horus.workflow"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/auto-registry/autoregistry.md).
