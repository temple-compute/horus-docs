---
sidebar_position: 4.5
title: Detachable Execution
---

# Detachable Execution

A long-running remote command must not die just because the connection that
started it dropped. Detachable execution makes a command launched through a
[Target](./target.md)'s channel **outlive the channel that started it**, so a
transient network blip no longer kills the job — and, later, a restarted
orchestrator can reconnect to it.

## Why

`run_command` used to hold a single channel open for a command's entire
duration. For `SSHTarget` that meant one foreground `asyncssh` exec channel,
with the remote process running as a plain child of that channel. A mid-run
network drop tore down the channel and the job with it — a real Boltz-2
virtual-screening run lost three hours of work to a Wi-Fi blip. No amount of
keepalive tuning fixes that; only **detaching the remote process from the
channel** does.

Detachment is a **target-layer property, not an executor opt-in.** Executors
(`ShellExecutor`, `PythonEnvironmentExecutor`, `DockerExecutor`, …) all drive
the same `run_command → stream/communicate → kill` pattern. Putting detach in
one executor would silently miss the others. Instead it lives in `BaseTarget`,
so **every executor that already calls `run_command` gets it for free, with no
executor-side changes.**

## `run_command` is a template method

`run_command` is no longer something each target hand-rolls. It is a concrete
template on `BaseTarget` that either runs synchronously (the old behavior) or
launches detached and returns a polling handle:

```python
async def run_command(
    self, cmd, *, cwd=None, env=None, detach: bool | None = None
) -> ChannelProcess:
    if detach is None:
        detach = self.detach_by_default
    if not detach:
        return await self._run_command_sync(cmd, cwd=cwd, env=env)
    job_dir = new_job_dir(cwd or self.working_directory)
    handle = await self._launch(cmd, cwd=cwd, env=env, job_dir=job_dir)
    return _PollingChannelProcess(self, handle)
```

Callers keep the exact same signature and return type
(`ChannelProcess`) — nothing in an executor changes. A target opts into
detachment by implementing a handful of small primitives instead of overriding
`run_command`.

:::note Backwards compatible
A target may still override `run_command` directly (it then opts out of
detachment). The primitives ship with `NotImplementedError` defaults rather
than as abstract methods, so existing `BaseTarget` subclasses — including
third-party plugins — are unaffected until they choose to adopt them.
:::

## The primitives a target implements

To gain detachment, a concrete target implements these instead of a poll loop
of its own:

```python
async def _run_command_sync(self, cmd, *, cwd, env) -> ChannelProcess
async def _launch(self, cmd, *, cwd, env, job_dir) -> JobHandle
async def _poll(self, handle) -> int | None          # None while running
async def _read_output(self, handle) -> tuple[bytes, bytes]
async def _send_signal(self, handle, sig) -> None
```

| Primitive | Responsibility |
|-----------|----------------|
| `_run_command_sync` | The old synchronous, channel-bound execution (the `detach=False` fast path). |
| `_launch` | Start the command so it outlives the launching channel; return an opaque `JobHandle`. |
| `_poll` | Non-blocking status: `None` while running, the exit code once finished. |
| `_read_output` | The job's captured `(stdout, stderr)` so far, read channel-independently. |
| `_send_signal` | Best-effort signal delivery without a live channel. |

### `JobHandle` and the marker files

`_launch` records everything needed to observe the job later. The shared
`build_detach_command` helper wraps the command so it survives the channel:

```text
mkdir -p <job_dir> || exit 1;
nohup sh -c '( <cmd> ); echo $? > <job_dir>/exit_code' \
    > <job_dir>/stdout.log 2> <job_dir>/stderr.log < /dev/null &
echo $! > <job_dir>/pid
```

- `nohup` + redirected output + closed stdin make the job ignore `SIGHUP` when
  the channel closes.
- The **`exit_code` file is the authoritative "done" signal** — observable
  even after the launching channel is long gone. A liveness check
  (`kill -0 <pid>`) is only a fast-path hint, so a reused PID after the job
  finishes can't be mistaken for a still-running job.
- The launcher returns as soon as the job is backgrounded; the returned
  `JobHandle` carries the `pid` and `job_dir`.

## The polling handle

`_PollingChannelProcess` is the shared `ChannelProcess` returned for a detached
job. It satisfies the exact same contract as any other channel process —
`wait` / `communicate` / `stream` / `kill` / `signal` / `returncode` — but
implements each by **polling the target's primitives** instead of holding a
channel open:

- `wait()` loops `_poll` until it returns an exit code (sleeping
  `poll_interval` between checks).
- `communicate()` waits, then `_read_output`.
- `stream()` re-reads the captured logs on each tick and yields the new lines —
  live-ish, with up to `poll_interval` latency, which is the price of channel
  independence.
- `kill()` / `signal()` schedule `_send_signal` (delivery may need a round
  trip); callers confirm the effect by continuing to poll.

Because every method re-probes on demand, a dropped connection just pauses
polling — the next reconnect resumes it, and the job never noticed.

## Per-target default: `detach_by_default`

Detachment only helps where there is a **droppable channel**. Each target sets
whether `run_command` detaches when the caller doesn't say:

```python
class BaseTarget(...):
    detach_by_default: ClassVar[bool] = True
    poll_interval: ClassVar[float] = 1.0
```

| Target | `detach_by_default` | Why |
|--------|--------------------|-----|
| `SSHTarget` | `True` | A remote job must survive a dropped SSH channel. |
| `LocalTarget` | `False` | No channel to drop; keep the live-streaming subprocess path. Detachment is still available (e.g. for recovery). |

Local execution therefore behaves exactly as before by default; it implements
the primitives too, but only uses them when detachment is explicitly requested.

### `detach=False` for control-plane commands

Short synchronous commands should not be detached. Callers pass `detach=False`
for them so they block and stream over the live channel as before:

- `SSHTarget.mkdir` runs `mkdir -p` with `detach=False`.
- `DockerExecutor` runs `docker build` / `docker rmi` with `detach=False`,
  while the main `docker run` keeps the detached default — so a container
  running over SSH now survives a dropped channel for free.

## What executors need to change

Nothing. `ShellExecutor`, `PythonEnvironmentExecutor` and `DockerExecutor` call
`run_command` and consume the returned `ChannelProcess` exactly as before;
detachment is transparent. `PythonFunctionExecutor` / `PythonExecExecutor` call
Python in-process and never touch `run_command`, so they are naturally exempt —
there is no separate process to detach from.

## Adding detachment to a new target

Implement the five primitives; the shared `run_command` template,
`_PollingChannelProcess`, and (later) `recover()` do the rest. A future
`SlurmExecutor`, for example, maps them to `sbatch` (`_launch`), `sacct` /
`squeue` (`_poll`), the Slurm log files (`_read_output`) and `scancel`
(`_send_signal`) — and inherits full detach with no polling or state-file logic
of its own.

## Groundwork for resume

The same primitives are the foundation for **checkpoint/resume** (reconnecting
after the orchestrator itself restarts, not just after a channel drop). A
persisted run-state file plus a `recover(task)` that rehydrates a `JobHandle`
and rebuilds the same `_PollingChannelProcess` lets a fresh `horus` process
reattach to a still-running job. That work is tracked separately; detachable
execution described here is the layer it builds on.
