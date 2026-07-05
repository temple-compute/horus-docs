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
| `--no-skip TASK_ID` | none | Force a specific task to run even if it is already complete. Repeat the option to force multiple tasks. |
| `--no-skip-all` | off | Force every task to run, ignoring completion status. |


```bash
# Run only the part of the graph around "train"
horus run pipeline.yaml --trigger train

# Plain log output, no dashboard
horus run pipeline.yaml --no-tui

# Re-run just the preprocessing step
horus run pipeline.yaml --no-skip preprocess

# Re-run multiple tasks
horus run pipeline.yaml \
  --no-skip preprocess \
  --no-skip train

# Force every task to run
horus run pipeline.yaml --no-skip-all
```

:::tip Re-running skips finished work
By default, Horus skips any task whose output artifacts already exist.

You can control this behavior in two ways:

- Set `skip_if_complete: false` on a task to always execute it.
- Override the behavior from the command line:
  - `--no-skip TASK_ID` forces one or more specific tasks to run.
  - `--no-skip-all` forces every task to run.

If `--no-skip` is given an unknown task ID, Horus reports the valid task IDs and exits with an error.
:::

## From Python

For workflows defined in Python, run them with `render_workflow` for the live
dashboard, or `asyncio.run(wf.run(...))` without it:

```python
from horus_builtin import render_workflow

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
