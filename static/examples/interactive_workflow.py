"""A Python workflow that prompts the user.

    python interactive_workflow.py

A ``FunctionTask`` can ask the user questions through ``task.interaction``. When
running under the live TUI, the dashboard pauses while the prompt is shown and
resumes once you answer. YAML workflows cannot do this; it needs real Python.
"""

from pathlib import Path

from horus_builtin.artifact.file import FileArtifact
from horus_builtin.event.tui_subscriber import render_workflow
from horus_builtin.interaction.common.confirm import ConfirmInteraction
from horus_builtin.interaction.common.string import StringInteraction
from horus_builtin.target.local import LocalTarget
from horus_builtin.task.function import FunctionTask
from horus_builtin.workflow.horus_workflow import HorusWorkflow
from horus_runtime.context import HorusContext
from horus_runtime.core.artifact.base import BaseArtifact

HorusContext.boot()

wf = HorusWorkflow(name="interactive")

work = LocalTarget(working_directory="./horus-work")
greeting = FileArtifact(id="greeting", path=Path("horus-out/greeting.txt"))


@FunctionTask.task(wf, outputs=[greeting], target=work)
async def greet_user(
    task: FunctionTask, greeting: FileArtifact
) -> list[BaseArtifact]:
    """Ask the user for their name, confirm, then write a greeting."""
    name = await task.interaction.ask(
        StringInteraction(
            value_key="name",
            prompt="What is your name?",
            default="World",
        )
    )

    shout = await task.interaction.ask(
        ConfirmInteraction(
            value_key="shout",
            prompt="Shout the greeting?",
            default=False,
        )
    )

    message = f"Hello, {name}!"
    greeting.write(message.upper() if shout else message)
    return []


if __name__ == "__main__":
    render_workflow(wf, trigger_id="greet_user")
