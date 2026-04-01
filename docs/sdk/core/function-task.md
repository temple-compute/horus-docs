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

from horus_builtin.artifact.file import FileArtifact
from horus_builtin.executor.shell import ShellExecutor
from horus_builtin.runtime.command import CommandRuntime
from horus_builtin.task.function import FunctionTask
from horus_builtin.task.horus_task import HorusTask
from horus_builtin.workflow.horus_workflow import HorusWorkflow
from horus_runtime.context import HorusContext
from horus_runtime.logging import horus_logger

horus_logger.set_level("DEBUG")

ctx = HorusContext.boot()

wf = HorusWorkflow(name="my_workflow")


@FunctionTask.task(
    wf,
    outputs={"data_file": FileArtifact(path="data.txt")},
)
def prepare_data() -> None:
    with open("data.txt", "w", encoding="utf-8") as f:
        f.write("This is some sample data for the workflow.\n")
        f.write("You can replace this with actual data processing logic.\n")


execute_data_task = HorusTask(
    name="task1",
    outputs={"output1": FileArtifact(path="data.txt")},
    executor=ShellExecutor(),
    runtime=CommandRuntime(command="echo 'Hello, from task1!' >> data.txt"),
    skip_if_complete=False,
)
wf.tasks[execute_data_task.name] = execute_data_task


@FunctionTask.task(
    wf,
    inputs={"data_file": FileArtifact(path="data.txt")},
)
def read_results() -> None:
    with open("data.txt", encoding="utf-8") as f:
        print(f.read())


asyncio.run(wf.run())
```

## Important Behavior

### Inputs are validated, not injected

`FunctionTask` reuses `HorusTask.run()`, so declared input artifacts are checked
before execution. The wrapped function itself is currently called with no
arguments.

That means this works:

```python
@FunctionTask.task(wf, inputs={"data": FileArtifact(path="data.txt")})
def process() -> None:
    ...
```

But this is not currently how `FunctionTask` executes:

```python
@FunctionTask.task(wf, inputs={"data": FileArtifact(path="data.txt")})
def process(data: FileArtifact) -> None:
    ...
```

If you need artifact access inside the function, open the artifact path
yourself or capture what you need in Python when defining the function.

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
- `PythonFunctionExecutor`: calls the callable in-process
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
