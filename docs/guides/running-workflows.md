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

## How tasks are scheduled

Horus does not walk the graph one task at a time. It runs a **ready-set
scheduler**: as soon as a task's dependencies are all satisfied, it is
dispatched, and it runs concurrently with every other task that is also ready.
The scheduler reacts to each completion and unblocks whatever became ready as a
result, so independent branches of the DAG progress in parallel rather than
waiting on an arbitrary serial order.

Two knobs bound the concurrency:

- **`max_concurrency`** (a workflow field, unbounded by default) caps how many
  tasks may run at once. A workflow that reuses a single-slot target across many
  placements still runs them concurrently: the scheduler hands each concurrent
  use its own copy of the target (same machine, same filesystem).
- **`capacity`** gates concurrency against finite resources per machine. See
  [resource-aware placement](./writing-workflows-yaml.mdx#resources-optional) if
  your tasks declare `resources`.

A failure still fails the run. By default the first failing task cancels the
others (fail-fast); see `failure_policy` to keep unaffected branches running.

## The live dashboard

While a workflow runs, `horus run` takes over the terminal with a live
dashboard:

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
the dashboard pauses so you can type your answer, then resumes. The question and
your answer stay in your scrollback after the run.

### When the run ends

The dashboard draws on the terminal's alternate screen, the same way `less` or
`vim` do, so it does not scroll past as it redraws. When the run finishes the
dashboard closes and the terminal returns to what it was showing before, leaving
a single summary line behind:

```text
pipeline  ·  COMPLETED  ·  6/6 tasks  ·  1m12s
```

If the run failed, the failure panel is printed under that line, so the error
survives after the dashboard is gone.

Because the dashboard is not part of your scrollback, you cannot scroll back
through it once the run ends. To keep a full record of a run, use `--no-tui` and
redirect the output to a file.

For plain logs (CI, redirecting to a file, or no TTY), add `--no-tui`.
