---
sidebar_position: 5
title: FunctionTask
---

# FunctionTask

`FunctionTask` is a code-first task type for authoring workflows directly in
Python. It wraps a plain Python function, pairs it with the Python-native
runtime and executor, and registers it into a workflow with a decorator.

## What It Gives You

- Zero-boilerplate task creation for Python functions
- Automatic task registration in a workflow
- In-process execution without spawning a shell
- Support for both sync and async Python callables
- Named argument injection from task context (`task`, plus each input/output
  artifact by its `id`)
- A default CLI interaction transport for interactive tasks
- The usual `HorusTask` behavior for input validation, output-based skip logic,
  events, and reset support

## Decorator API

```python
@FunctionTask.task(
    wf,
    name,
    inputs,
    outputs,
    target,
)
def my_step() -> None:
    ...
```

The decorator:

1. creates a `FunctionTask`
2. wraps the function in `PythonFunctionRuntime`
3. uses `PythonFunctionExecutor` by default
4. defaults the task `id` and `name` to the function's name
5. appends the task to `wf.tasks` (a list)

## Basic Example

```python
import asyncio

from horus_builtin.task.function import FunctionTask
from horus_builtin.workflow.horus_workflow import HorusWorkflow
from horus_runtime.context import HorusContext

ctx = HorusContext.boot()
wf = HorusWorkflow(name="my_workflow")

@FunctionTask.task(wf)
def my_task() -> None:
    print("Hello, Horus!")


# Trigger the run with the task's id (defaults to the function name).
asyncio.run(wf.run(trigger_id="my_task"))
```

### Parameters Are Injected By Name

`FunctionTask` callables can declare any subset of these names:

- `task`: the full `FunctionTask` instance
- the `id` of any declared input artifact
- the `id` of any declared output artifact

Horus builds a name→artifact mapping keyed by `artifact.id`, matches your
parameters against it, and calls your function with keyword args. Choose
artifact IDs that are valid Python identifiers if you want to inject them as
parameters.

```python
from horus_builtin.artifact.file import FileArtifact
from horus_builtin.task.function import FunctionTask
from horus_builtin.workflow.horus_workflow import HorusWorkflow

wf = HorusWorkflow(name="my_workflow")

@FunctionTask.task(
    wf,
    inputs=[FileArtifact(id="input_file", path="data.txt")],
    outputs=[FileArtifact(id="output_file", path="result.txt")],
)
def process(
    input_file: FileArtifact,
    output_file: FileArtifact,
    task: FunctionTask,
) -> None:
    content = input_file.path.read_text()
    output_file.path.write_text(content.upper())
    print(task.id)
```

The parameters `input_file` and `output_file` resolve to the artifacts whose
`id` matches those names. If your function declares a parameter name that is not
available from that context, Horus raises a `ValueError` during runtime setup.
If you declare `**kwargs`, Horus passes all available values from `task`,
`inputs`, and `outputs`.

### Async callables are supported

`PythonFunctionExecutor` detects awaitable return values and awaits them.

```python
@FunctionTask.task(wf)
async def fetch_data() -> None:
    ...
```

### Interactions are available through the task

`FunctionTask` defaults `interaction` to `CLIInteractionTransport()`.

This is useful for code-first workflows that need to prompt the user at
runtime:

```python
from horus_builtin.interaction.common.confirm import ConfirmInteraction
from horus_builtin.task.function import FunctionTask


@FunctionTask.task(wf)
async def confirm_run(task: FunctionTask) -> None:
    assert task.interaction is not None

    should_continue = await task.interaction.ask(
        ConfirmInteraction(
            value_key="run-confirmation",
            title="Run workflow",
            prompt="Do you want to continue?",
            default=True,
        )
    )

    if not should_continue:
        raise RuntimeError("User cancelled execution")
```

### Side Artifacts via Return Value

A `FunctionTask` callable can return a `BaseArtifact` or `list[BaseArtifact]`
to produce **side artifacts**: transient outputs that are not consumed by any
downstream task. The executor captures the return value and stores it on
`task.side_products`. The supported return type is:

```python
BaseArtifact | list[BaseArtifact] | None
```

Returning `None` (or nothing) is the default. Returning any other type logs a
warning but does not fail the task.

```python
from horus_builtin.artifact.file import FileArtifact
from horus_builtin.task.function import FunctionTask

@FunctionTask.task(wf)
def generate_diagnostics(task: FunctionTask) -> FileArtifact:
    log_path = task.side_artifacts_dir / "diag.txt"
    log_path.write_text("all checks passed\n")
    return FileArtifact(id="diag", path=log_path)
```

See [Side Artifacts](./side-artifact.md) for the full guide, including how to
produce side artifacts from shell and Python `exec`-based tasks.

### Output artifacts still drive skip logic

As with `HorusTask`, a `FunctionTask` is considered complete only when all
declared output artifacts exist. If no outputs are declared, it always runs.

## Under the Hood

`FunctionTask` is a thin convenience wrapper around:

- `PythonFunctionRuntime`: stores the callable
- `PythonFunctionExecutor`: calls the callable in-process with keyword args
  prepared by `PythonFunctionRuntime`, and awaits async results
- `HorusTask`: preserves Horus task lifecycle behavior

## When To Use It

Use `FunctionTask` when:

- you are building workflows directly in Python
- your task logic is easiest to express as normal Python code
- you do not need shell command execution for that step

Use `HorusTask` with `ShellExecutor` and `CommandRuntime` when:

- the task is naturally a shell command
- the workflow is primarily YAML or command oriented
