---
sidebar_position: 5
title: Task
---

# Task System

Tasks are the unit of work in Horus. A task binds together its input and output
artifacts, runtime, executor, target, and optional interaction transport.

## Core Concept

Every task must implement all three abstract methods:

```python
async def _run(self) -> None:
    ...

async def is_complete(self) -> bool:
    ...

async def _reset(self) -> None:
    ...
```

### Contract

- `_run()`: task-specific execution logic; do not mutate `status` here
- `is_complete()`: **async** — return `True` when all output artifacts are present and valid; used to skip already-complete tasks when `skip_if_complete=True`. It is `async` because checking an output artifact may require a round-trip to a remote target (see [`ArtifactStore`](./artifact.md#artifactstore)); callers must `await` it.
- `_reset()`: **async** — clear any subclass-specific state so the task can re-run; do not mutate `status` here. `reset()` / `_reset()` are `async`; callers must `await`.
- `run()` is the public `final` entry point and runs `TaskMiddleware`
- `kind: str` is the registry discriminator
- `executor` and `runtime` must be compatible
- `target` decides where the task is dispatched
- `interaction` can carry a task-level runtime prompt transport

Runtime compatibility is validated automatically after model construction. An
invalid executor/runtime pair raises `IncompatibleRuntimeError`.

## Base Task

All tasks inherit from `BaseTask`:

```python
class BaseTask(AutoRegistry, entry_point="task"):
    registry_key: ClassVar[str] = "kind"
    kind: str
    kind_name: ClassVar[str] = "Task"
    kind_description: ClassVar[str] = _("Base task")
    id: str
    name: str
    inputs: list[BaseArtifact] = Field(default_factory=list)
    outputs: list[BaseArtifact] = Field(default_factory=list)
    executor: BaseExecutor
    runtime: BaseRuntime
    target: BaseTarget
    status: TaskStatus = TaskStatus.IDLE
    runs: int = 0
    skip_if_complete: bool = True
    interaction: BaseInteractionTransport | None = None
    side_artifacts: list[BaseArtifact] = Field(default_factory=list)
    resources: ResourceRequest | None = None

    @property
    def working_dir(self) -> str:
        """Per-task folder under the target's working directory (target-side)."""
        ...

    @property
    def side_artifacts_dir(self) -> str:
        """The "side-artifacts" subdirectory of working_dir on the target; created before every run."""
        ...

    @final
    async def run(self) -> None:
        """Drives status transitions: RUNNING → COMPLETED | CANCELED | FAILED."""
        ...

    async def sync_status(self) -> TaskStatus:
        """Refresh self.status from the target and return the updated value."""
        ...

    @abstractmethod
    async def _run(self) -> None:
        """Task-specific execution logic. Do not set self.status here."""

    @abstractmethod
    async def is_complete(self) -> bool:
        """Return True when output artifacts are present and valid."""

    @final
    async def reset(self) -> None:
        """Reset status to IDLE and delegate to _reset()."""
        ...

    @abstractmethod
    async def _reset(self) -> None:
        """Subclass-specific reset logic. Do not set self.status here."""
```

Subclasses must implement `_run()`, `is_complete()`, and `_reset()`.

### `inputs` and `outputs`

Each artifact carries its own `id`. Tasks are linked into the workflow DAG by
explicit **edges**, not by matching artifact `id`s: an edge connects one task's
output to another task's input, and the consumer keeps its own input `id`
regardless of what the producer named its output. See
[DAG planning](./workflow.md#dag-planning) and [edges](./workflow.md#edges).

Output and input `id`s must be unique **within a task**, but the same output
`id` may appear on different tasks. Runtimes that need a name→artifact mapping
(for example to format a shell command or inject function parameters) build it
on the fly, keyed by `artifact.id`, from that task's own inputs and outputs.

### Side Artifacts

`side_artifacts` holds transient, undeclared artifacts produced during a run
that are not consumed by any downstream task. The directory
`task.side_artifacts_dir` (the `side-artifacts` subdirectory of `working_dir`)
is a **target-side path** (a `str`), created automatically by the executor
before every run. After
the run, the executor collects whatever lands there back to the orchestrator
over the target's channel and populates `task.side_artifacts`.

See [Side Artifacts](./side-artifact.md) for the full guide.

### Resources

A task can declare the compute resources it needs through the optional
`resources` field. It holds a `ResourceRequest`. A small, target-agnostic model
where every field is optional:

```python
from horus_runtime.core.resources import ResourceRequest
from horus_builtin.task.horus_task import HorusTask

task = HorusTask(
    id="predict",
    name="Boltz-2 prediction",
    runtime=...,
    executor=...,
    target=...,
    resources=ResourceRequest(gpus=1, memory_gb=32, vram_gb=40),
)
```

The same thing in workflow YAML:

```yaml
- id: predict
  name: Boltz-2 prediction
  kind: horus_task
  resources:
    gpus: 1
    memory_gb: 32
    vram_gb: 40
  # runtime / executor / target ...
```

| Field | Meaning |
|-------|---------|
| `cpus` | CPU cores to request (`None` lets the target decide) |
| `gpus` | GPUs to request (defaults to `0`) |
| `memory_gb` | System RAM, in GiB |
| `vram_gb` | GPU memory per GPU, in GiB |
| `walltime` | Maximum wall-clock time, a target-interpreted string (e.g. `"01:30:00"`) |

Resources are **advisory hints**. A *resource-aware* target translates the
request into its own provisioning primitives. For example, a Slurm target into `sbatch`
directives, a Terraform target into a cloud instance type... while a target that
does not understand resources simply ignores it.

#### How a target reads `resources`

By convention a target's own explicit settings take precedence over the task's
request, so a target can override what a task asked for. See
[Target](./target.md).

### Kind metadata

Registry-backed classes (tasks, targets, runtimes, executors, workflows)
now expose two optional ClassVar fields that provide human-friendly metadata
for client UIs and registries:

- `kind_name: ClassVar[str]` — a short, human-readable name for the kind.
- `kind_description: ClassVar[str]` — a longer description string. Prefer
    using a plugin-scoped translator created with `make_translator` (aliased
    as `_`) for translations; see the [SDK i18n guide](../i18n/index.md), e.g.:

```python
from your_plugin.i18n import tr as _

class HorusTask(BaseTask):
        kind: str = "horus_task"
        kind_name: ClassVar[str] = "Horus Task"
        kind_description: ClassVar[str] = _("Basic Horus task")
```

`run()` wraps `_run()` in `TaskMiddleware.call_with_middleware(...)` and owns
all status transitions.

## Built-in Tasks

- `HorusTask`: the standard task implementation for command-style execution
- `FunctionTask`: a code-first task that wraps a Python function and pairs it
  with `PythonFunctionRuntime` and `PythonFunctionExecutor`

## `HorusTask`

`HorusTask` provides the default task behavior:

- emits task lifecycle events
- validates that declared input artifacts exist before execution
- delegates execution to the configured executor
- treats a task as complete when all declared output artifacts exist

The default `HorusTask.target` is `LocalTarget`, so tasks run in-process unless
you provide a different target.

If a task declares no outputs, `HorusTask.is_complete()` returns `False`, so the
task always runs unless your workflow adds different logic.

## `FunctionTask`

`FunctionTask` is the simplest way to build an in-memory workflow in Python:

```python
@FunctionTask.task(wf)
def prepare_data() -> None:
    ...
```

The decorator creates a `FunctionTask`, wraps the function in a
`PythonFunctionRuntime`, and registers the task in the workflow automatically.
Function parameters are injected by name: `task` is available directly, and
other parameters are matched against the `id` of each declared input and output
artifact.

It also defaults `interaction` to the built-in CLI transport, which makes
interactive code-first tasks easy to author.

See [FunctionTask](./function-task.md) for the full guide and examples.

## Registering Custom Tasks

To register task plugins, expose them through:

```toml
[project.entry-points."horus.task"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/auto-registry/autoregistry.md).
