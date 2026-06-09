---
sidebar_position: 2
title: Side Artifacts
---

# Side Artifacts

Side artifacts are transient, undeclared artifacts that a task produces as a
by-product of its execution. Unlike declared `outputs`, side artifacts are not
consumed by any downstream task and do not participate in DAG dependency
resolution. They are intended for inspection: logs, debug dumps, intermediate
files, or any output that is useful to examine but does not feed the next step.

## How They Work

Every task has two filesystem properties:

- **`working_dir`** — a per-task folder under its target's working directory
  where inputs are materialized and outputs are written.
- **`side_artifacts_dir`** — `working_dir / "side-artifacts"`, created
  automatically by the executor before every run.

Side artifacts produced during a run are collected on `task.side_artifacts`:

```python
task.side_artifacts: list[BaseArtifact]
```

Side-product capture is **best-effort**: a failure while handling the return
value never fails the task itself.

## Producing Side Artifacts

How a task produces side artifacts depends on which executor it uses.

### `PythonFunctionExecutor`

A function wrapped by `FunctionTask` (or any task using `PythonFunctionRuntime`)
can return a `BaseArtifact` or `list[BaseArtifact]` to declare side products.
The executor captures the return value and stores it in `task.side_artifacts`.
The supported return type is:

```python
BaseArtifact | list[BaseArtifact] | None
```

Returning `None` (or nothing) is the default and produces no side products.
Returning any other type logs a warning and is otherwise ignored.

```python
from horus_builtin.artifact.file import FileArtifact
from horus_builtin.task.function import FunctionTask
from horus_builtin.workflow.horus_workflow import HorusWorkflow

wf = HorusWorkflow(name="my_workflow")

@FunctionTask.task(wf)
def generate_report(task: FunctionTask) -> FileArtifact:
    log_path = task.side_artifacts_dir / "report.txt"
    log_path.write_text("diagnostics: all checks passed\n")
    return FileArtifact(id="report", path=log_path)
```

You can also return multiple artifacts:

```python
@FunctionTask.task(wf)
def generate_report(task: FunctionTask) -> list[FileArtifact]:
    a = task.side_artifacts_dir / "summary.txt"
    b = task.side_artifacts_dir / "details.txt"
    a.write_text("summary\n")
    b.write_text("details\n")
    return [
        FileArtifact(id="summary", path=a),
        FileArtifact(id="details", path=b),
    ]
```

### `PythonExecExecutor`

Tasks using `PythonCodeStringRuntime` have `HORUS_SIDE_ARTIFACTS_DIR` injected
into the `exec()` scope as a string variable. Write files into that path to
produce side artifacts. The variable holds the absolute path to
`task.side_artifacts_dir`.

```python
from horus_builtin.executor.python_exec import PythonExecExecutor
from horus_builtin.runtime.python_string import PythonCodeStringRuntime
from horus_builtin.target.local import LocalTarget
from horus_builtin.task.horus_task import HorusTask
from pathlib import Path

code = """
import json
from pathlib import Path

out = Path(HORUS_SIDE_ARTIFACTS_DIR) / "debug.json"
out.write_text(json.dumps({"status": "ok"}))
"""

task = HorusTask(
    name="python_step",
    target=LocalTarget(),
    executor=PythonExecExecutor(),
    runtime=PythonCodeStringRuntime(code=code),
)
```

### `ShellExecutor`

Tasks using `CommandRuntime` receive `HORUS_SIDE_ARTIFACTS_DIR` as an
environment variable in the subprocess. Write files into that path to produce
side artifacts.

```python
from horus_builtin.executor.shell import ShellExecutor
from horus_builtin.runtime.command import CommandRuntime
from horus_builtin.target.local import LocalTarget
from horus_builtin.task.horus_task import HorusTask

task = HorusTask(
    name="shell_step",
    target=LocalTarget(),
    executor=ShellExecutor(),
    runtime=CommandRuntime(
        command='echo "diagnostics" > "$HORUS_SIDE_ARTIFACTS_DIR/run.log"'
    ),
)
```

## Inspecting Side Artifacts

Captured artifacts are accessible after the
run via `task.side_artifacts`:

```python
for artifact in task.side_artifacts:
    print(artifact.id, artifact.path)
```
