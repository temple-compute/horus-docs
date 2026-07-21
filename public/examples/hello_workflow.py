"""A minimal Python-defined Horus workflow.

    python hello_workflow.py

Two tasks wired by an edge: ``make_greeting`` writes a file, ``shout_it`` reads
it and writes an uppercased copy. ``render_workflow`` runs the workflow under
the same live TUI as ``horus run``. Reach for a Python workflow when a task
needs real Python logic, such as reading or processing files, calling a
library, or prompting the user (see interactive_workflow.py).
"""

from pathlib import Path

from horus_builtin.artifact.file import FileArtifact
from horus_builtin import render_workflow
from horus_builtin.target.local import LocalTarget
from horus_builtin.task.function import FunctionTask
from horus_builtin.workflow.horus_workflow import HorusWorkflow
from horus_runtime.context import HorusContext
from horus_runtime.core.artifact.base import BaseArtifact
from horus_runtime.core.workflow.edge import WorkflowEdge

# Boot the runtime once before building or running anything.
HorusContext.boot()

wf = HorusWorkflow(name="hello_python")

# Per-task scratch lives under ./horus-work; outputs under ./horus-out.
work = LocalTarget(working_directory="./horus-work")
greeting = FileArtifact(id="greeting", path=Path("horus-out/greeting.txt"))
shout = FileArtifact(id="shout", path=Path("horus-out/shout.txt"))


# The task id and name default to the function name ("make_greeting"). The
# parameters after `task` are the task's artifacts, matched by their id.
@FunctionTask.task(wf, outputs=[greeting], target=work)
async def make_greeting(
    task: FunctionTask, greeting: FileArtifact
) -> list[BaseArtifact]:
    """Write a greeting to the output artifact."""
    greeting.write("Hello from a Python workflow!")
    return []


@FunctionTask.task(wf, inputs=[greeting], outputs=[shout], target=work)
async def shout_it(
    task: FunctionTask, greeting: FileArtifact, shout: FileArtifact
) -> list[BaseArtifact]:
    """Read the greeting and write an uppercased version."""
    shout.write(greeting.read().upper())
    return []


# Wire make_greeting's output into shout_it's input: this declares the ordering.
wf.edges.append(
    WorkflowEdge(
        source="make_greeting",
        source_output="greeting",
        target="shout_it",
        target_input="greeting",
    )
)

if __name__ == "__main__":
    # Trigger from the first task; the edge pulls shout_it in as a descendant.
    render_workflow(wf, trigger_id="make_greeting")
