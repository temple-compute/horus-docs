---
sidebar_position: 6
title: Running workflows
---

# Running workflows

## From a YAML file

```bash
horus run WORKFLOW.yaml
```

Horus loads the workflow, plans the DAG from the trigger task, and runs it while
showing a live dashboard. It exits non-zero if a task fails.

### Options

| Option | Default | What it does |
|--------|---------|--------------|
| `--trigger TASK_ID` | first task in the file | Start from a specific task. The run includes that task, its upstream dependencies, and its downstream consumers. |
| `--no-tui` | off | Turn off the live dashboard and stream plain log output instead. Useful for CI, logs, or piping. |

```bash
# Run only the part of the graph around "train"
horus run pipeline.yaml --trigger train

# Plain log output, no dashboard
horus run pipeline.yaml --no-tui
```

:::tip Re-running skips finished work
A task whose output artifacts already exist is skipped on the next run. Set
`skip_if_complete: false` on a task to always run it.
:::

## From Python

For workflows defined in Python, run them with `render_workflow` for the live
dashboard, or `asyncio.run(wf.run(...))` without it:

```python
from horus_builtin.event.tui_subscriber import render_workflow

render_workflow(wf, trigger_id="make_greeting")
```

See [Writing workflows in Python](./writing-workflows-python.mdx).

## The live dashboard

While a workflow runs, `horus run` shows a live terminal dashboard:

- Header: the workflow name, its status (`RUNNING`, `COMPLETED`, `FAILED`, and
  so on), and elapsed wall-clock time.
- Progress bar: how many tasks have finished out of the total in scope.
- Task table: one row per task with a status glyph, its target, requested
  resources, and elapsed time. The glyphs are `◌` idle, `◔` pending, `●`
  running, `✓` completed, `✗` failed, and `⊘` canceled.
- Dependency graph: a tree view of the DAG, colored by each task's status.
- Log: a scrolling pane of recent events and task output.
- Failure panel: if a task fails, its error is shown here, and the command exits
  non-zero.

When a Python task
[asks the user a question](./writing-workflows-python.mdx#prompting-the-user),
the dashboard pauses so you can type your answer, then resumes.

For plain logs (CI, redirecting to a file, or no TTY), add `--no-tui`.
