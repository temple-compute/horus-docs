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
- Automatic task injection when the wrapped callable accepts one parameter
- A default CLI interaction transport for interactive tasks
- The usual `HorusTask` behavior for input validation, output-based skip logic,
  events, and reset support

## Decorator API

```python
@FunctionTask.task(
    wf,
    name=None,
    inputs=None,
    outputs=None,
)
def my_step() -> None:
    ...
```

The decorator:

1. creates a `FunctionTask`
2. wraps the function in `PythonFunctionRuntime`
3. uses `PythonFunctionExecutor` by default
4. inserts the task into `wf.tasks`

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


asyncio.run(wf.run())
```

### The task instance is passed when the function accepts one parameter

If the wrapped callable declares a parameter, Horus passes the current task as
the first argument.

```python
from horus_builtin.artifact.file import FileArtifact
from horus_builtin.task.function import FunctionTask
from horus_builtin.workflow.horus_workflow import HorusWorkflow

wf = HorusWorkflow(name="my_workflow")

@FunctionTask.task(wf, inputs={"data": FileArtifact(path="data.txt")})
def process(task: FunctionTask) -> None:
    data_artifact = task.inputs["data"]
    print(data_artifact)
```

This gives function-based tasks access to:

- `task.inputs`
- `task.outputs`
- `task.variables`
- `task.interaction`
- `task.name` and `task.task_id`

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

### Return values are ignored

The wrapped function's return value is not currently used by the workflow
engine. In practice, tasks should communicate completion through declared
artifacts and other side effects.

Prefer this:

```python
@FunctionTask.task(
    wf,
    outputs={"report": FileArtifact(path="report.txt")},
)
def write_report() -> None:
    with open("report.txt", "w", encoding="utf-8") as f:
        f.write("done\n")
```

Over this:

```python
@FunctionTask.task(wf)
def write_report() -> FileArtifact:
    return FileArtifact(path="report.txt")
```

### Output artifacts still drive skip logic

As with `HorusTask`, a `FunctionTask` is considered complete only when all
declared output artifacts exist. If no outputs are declared, it always runs.

## Under the Hood

`FunctionTask` is a thin convenience wrapper around:

- `PythonFunctionRuntime`: stores the callable
- `PythonFunctionExecutor`: calls the callable in-process, injecting the task
  when needed and awaiting async results
- `HorusTask`: preserves Horus task lifecycle behavior

## When To Use It

Use `FunctionTask` when:

- you are building workflows directly in Python
- your task logic is easiest to express as normal Python code
- you do not need shell command execution for that step

Use `HorusTask` with `ShellExecutor` and `CommandRuntime` when:

- the task is naturally a shell command
- you want string formatting against inputs, outputs, and variables
- the workflow is primarily YAML or command oriented
