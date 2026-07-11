---
sidebar_position: 8
title: Workflow
---

# Workflow System

Workflows orchestrate a set of tasks connected as a **directed acyclic graph
(DAG)**.

Tasks are not executed in definition order. Instead, Horus derives the
execution order from the workflow's explicit **edges**: each edge wires one
task's output to another task's input, declaring that the producer must run
before the consumer. The workflow author declares the tasks and the edges
between them; the runtime works out *when* each task runs (see
[DAG planning](#dag-planning)).

> **Edges are the sole source of truth for the DAG.** Earlier versions inferred
> dependencies by matching input/output artifact `id`s. That implicit matching
> is gone: two tasks that happen to share an artifact `id` are **not** linked
> unless an edge connects them, and a workflow with no edges treats its tasks as
> independent nodes with no ordering.

## Core Concept

Every workflow must implement all three abstract methods:

```python
@classmethod
def from_yaml(cls, path: str | Path) -> Self:
    ...

async def _run(self, trigger_id: str) -> None:
    ...

async def _reset(self) -> None:
    ...
```

### Contract

- `from_yaml()`: load and construct a workflow from a YAML file
- `_run(trigger_id)`: workflow-specific execution logic; do not mutate `status` here
- `_reset()`: **async**: subclass-specific reset logic; do not mutate `status` here. `reset()` / `_reset()` are `async`; callers must `await`.
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
    edges: list[WorkflowEdge] = Field(default_factory=list)
    orchestrator_target: BaseTarget | None = None
    status: WorkflowStatus = WorkflowStatus.IDLE

    @classmethod
    @abstractmethod
    def from_yaml(cls, path: str | Path) -> Self:
        """Load and construct a workflow from a YAML file."""

    async def transfer_artifacts(
        self,
        task: BaseTask,
        source_map: dict[tuple[str, str], EdgeSource] | None = None,
    ) -> None:
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
    async def reset(self) -> None:
        """Reset status to IDLE and delegate to _reset()."""
        ...

    @abstractmethod
    async def _reset(self) -> None:
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
user upload). A task consumes a root artifact through an **edge** whose source
is the root (using the `artifact-<rootId>` source convention, see
[`edges`](#edges)).

Root artifacts have no producer task, so they create no dependency during DAG
planning, and the transfer layer treats them as coming from
`orchestrator_target`.

Root artifact `id`s must be unique among the root artifacts.

### `edges`

`edges` is a list of `WorkflowEdge` connections, and the **single source of
truth** for both the DAG and the artifact transfer sources. Each edge wires one
producer output to one consumer input:

```python
class WorkflowEdge(BaseModel):
    source: str          # producer task id, or "artifact-<rootId>" for a root
    source_output: str   # output artifact id on the source (or the root id)
    target: str          # consumer task id
    target_input: str    # input artifact id on the consumer task
    transfer: bool = True # False for an ordering-only edge (see below)
```

A `source` that names a task declares a **dependency**: the source task must
complete before the `target` task. A `source` of the form `artifact-<rootId>`
is a **root source**: it feeds a user-provided root artifact into the input and
adds no dependency.

Edges are validated at construction time (see [Edge validation](#edge-validation)),
so a typo cannot silently drop a dependency or misroute a transfer.

```python
from horus_runtime.core.workflow.edge import WorkflowEdge

WorkflowEdge(
    source="parse",          # task "parse" produces ...
    source_output="parsed",  # ... its output artifact "parsed" ...
    target="dock",           # ... which feeds task "dock" ...
    target_input="ligand",   # ... as its input "ligand".
)
```

Because the connection is explicit, the producer output and the consumer input
may carry **different** `id`s (`parsed` to `ligand`); the old requirement that
they share an `id` no longer applies.

### Ordering-only edges (`transfer=False`)

By default an edge does two things at once: it orders the two tasks (source
before target) and it routes the source artifact into the target input. Set
`transfer=False` to keep only the ordering and drop the routing:

```python
WorkflowEdge(
    source="clone",
    source_output="slice",
    target="gather",
    target_input="results",
    transfer=False,   # order gather after clone, move no bytes
)
```

An ordering-only edge still validates its endpoints and still makes `target`
depend on `source` in the DAG, but it contributes nothing to the transfer
source map, so the target input keeps whatever path it already has. This is what
lets many producers order-gate a single consumer whose real data input is not
fed by any one upstream edge (for example a populated folder that several tasks
each write a slice into). Because such an edge routes no data, the
[one edge per `(target, target_input)`](#edge-validation) rule does not apply to
it: any number of `transfer=False` edges, plus at most one `transfer=True` edge,
may feed the same input.

The declarative fan-out / fan-in (map) construct is built on ordering-only
edges.

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

1. resolves, for each input, the source from the workflow `edges`: a task source
   yields the producer task's target and its output artifact; a root-source edge
   yields the workflow's `orchestrator_target`
2. looks up the registered `BaseTransferStrategy` for the `(source, destination)` pair
3. transfers a copy of the **producing** artifact (it carries the `id` the data
   is stored under) and then repoints the consumer input's `path` at the
   materialized result, so the input keeps its own `id` for templating

`_run()` builds the edge source map once and passes it to every
`transfer_artifacts()` call via the optional `source_map` argument; omitting it
rebuilds the map on demand.

See [Transfer Strategy](./transfer.md) for details.

## Built-in Workflow

- `HorusWorkflow`: builds the DAG from the workflow `edges`, computes an
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
from horus_runtime.core.workflow.edge import WorkflowEdge

wf = HorusWorkflow(
    name="example",
    tasks=[prepare, final_step],
    edges=[
        WorkflowEdge(
            source="prepare",
            source_output="dataset",
            target="final_step",
            target_input="input",
        ),
    ],
)

# Run the workflow, triggered by the task whose id is "final_step".
# The edge pulls "prepare" in as an ancestor, so it runs first.
asyncio.run(wf.run(trigger_id="final_step"))
```

## Task IDs

Each task owns an explicit `id`. Task IDs must be **unique** within a workflow,
they are the handles used for dependency resolution, for selecting a trigger,
and for keying tasks internally.

Uniqueness is enforced at construction time by a model validator: a workflow
with two tasks sharing an `id` raises `TaskIdsAreNotUniqueError`.

Artifact `id` uniqueness is enforced only where edge resolution needs it
(`ArtifactIdsAreNotUniqueError` otherwise):

- **output** `id`s must be unique **within each task**;
- **input** `id`s must be unique **within each task**;
- **root** artifact `id`s must be unique among the root artifacts.

Output `id`s may now **repeat across tasks**: because edges resolve on
`(task id, output id)` and task `id`s are unique, the same reusable task (sharing
a `definition_id`) can be placed in a workflow more than once, each placement
keeping its own unique task `id`.

## DAG planning

A workflow is a directed acyclic graph where **nodes are tasks** and **edges
are the workflow's `WorkflowEdge` connections**. The graph is derived entirely
from `edges` — never from artifact-`id` matching.

### How dependencies are derived

1. **Edges.** Each edge whose `source` is a task adds a dependency: the
   `target` task depends on the `source` task. Edges whose `source` is a root
   artifact (`artifact-<rootId>`) add no dependency — root inputs are graph
   entry points sourced from `orchestrator_target`.
2. **No edges, no ordering.** A workflow with no edges has fully independent
   tasks. Sharing an artifact `id` across two tasks does **not** link them.
3. **Ordering.** The resulting graph is sorted topologically (Kahn's algorithm,
   with ties broken deterministically by id) to produce the execution order.

If the edges form a cycle, planning fails with `CyclicDependencyError`.

### Edge validation

Because edges are the only thing wiring the DAG, they are validated at workflow
construction time so a typo cannot silently drop a dependency or misroute a
transfer. A workflow raises:

- `UnknownEdgeEndpointError` if an edge references a missing task, a
  `target_input` that the target task does not declare, a `source_output` that
  the source task does not produce, or a root `source_output` that no root
  artifact declares;
- `DuplicateEdgeTargetError` if two **transferring** edges feed the same
  `(target, target_input)`: each consumer input may be fed by at most one
  `transfer=True` edge. Ordering-only (`transfer=False`) edges are exempt, since
  they route no data (see
  [Ordering-only edges](#ordering-only-edges-transferfalse)).

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

## Registering Custom Workflows

To register workflow plugins, expose them through:

```toml
[project.entry-points."horus.workflow"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/auto-registry/autoregistry.md).
