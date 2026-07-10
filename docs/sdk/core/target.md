---
sidebar_position: 4
title: Target
---

# Target System

Targets describe **where** a task runs and expose the **agentless channel**
used to run it there.

A target is two things:

1. **Placement and identity**. Which machine, agent, or environment boundary
   the task runs on (`location_id`, consumed by the transfer system).
2. **An agentless channel**. A small I/O surface (`run_command`, `put_file`,
   `get_file`, `mkdir`) that executors use to run commands and move files on
   that location **without requiring any Horus installation on the remote
   side**.

`task.run()` always executes on the orchestrator. The executor renders the
payload and pushes the actual work to the target's channel, so the *same*
runtime and executor pair runs unchanged on a local target or a remote SSH
target, only the channel implementation differs.

In short:

- `Runtime` prepares the payload (the command or script)
- `Executor` drives the target's channel to run that payload
- `Target` owns the dispatch lifecycle **and** the channel

## Why Targets Exist

It is tempting to make executors responsible for both placement and execution.
That works for simple local runs, but it couples two different concerns:

- placement: choosing the machine, agent, or environment boundary
- execution: deciding how the prepared payload is invoked there

`BaseTarget` separates them. The workflow dispatches a task to a location, and
the executor runs it there through the target's channel.

## The dispatch lifecycle is shared

The dispatch lifecycle: `_dispatch`, `wait`, `cancel`, `get_status` lives on
`BaseTarget` as a **concrete default**: `_dispatch` schedules
`asyncio.create_task(task.run())` on the orchestrator's event loop, and the
other methods drive that task. Because `task.run()` runs on the orchestrator
for *every* target (local or remote), most targets never override the
lifecycle. A concrete target only implements:

- `location_id`: its placement identity
- `access_cost`: transfer cost hints
- the four channel primitives

`dispatch()` remains the public `@final` entry point and is the only lifecycle
method wrapped by `TargetMiddleware` today.

## Targets are agentless channels

The channel is the low-level surface executors use to do work on the target.
It never assumes Horus is installed on the other side, only the binaries the
command itself names (a shell, `docker`, `sbatch`, …).

```python
async def run_command(self, cmd, *, cwd=None, env=None, detach=None) -> ChannelProcess
async def put_file(self, content, remote_path) -> None   # bytes | local Path
async def get_file(self, remote_path) -> bytes
async def mkdir(self, path) -> None                      # mkdir -p semantics
async def list_dir(self, path) -> list[RemoteDirEntry]   # non-recursive listing
```

`run_command` is a **template method**: it either runs synchronously or
launches the command **detached** (so it survives a dropped channel), driven by
a few small target primitives rather than a per-target implementation. Concrete
targets implement those primitives instead of overriding `run_command`. See
[Detachable Execution](./detaching.md).

`list_dir` returns the immediate children of a target-side directory as
`RemoteDirEntry` tuples — everything a caller needs to walk and fetch a tree
without ever touching the local filesystem:

```python
class RemoteDirEntry(NamedTuple):
    name: str       # basename
    path: str       # absolute path on the target host
    is_dir: bool
    size: int       # file size in bytes; 0 for directories
```

`run_command` returns a `ChannelProcess` handle:

```python
class ChannelProcess(ABC):
    @property
    def returncode(self) -> int | None: ...
    async def wait(self) -> int: ...                     # exit code
    async def communicate(self) -> tuple[bytes, bytes]:  # (stdout, stderr)
        ...
    def kill(self) -> None: ...                          # whole process group
    def signal(self, sig: int) -> None: ...
```

Semantics every channel implementation must follow:

- **Streams are bytes.** Callers decode as needed.
- **`env` merges** onto the channel's base environment (for a local target,
  `os.environ`; for SSH, the remote login environment).
- **`cwd` is a target-side path** that the channel applies. Locally via the
  subprocess `cwd`, remotely by inlining `cd <cwd> && …`.
- **`list_dir` is native and OS-agnostic.** Implementations must use a
  non-shell mechanism (`pathlib` locally, SFTP/agent API remotely) so listing
  works regardless of the target's OS, and must **skip symlinks** (cycles and
  noise). Returns `[]` for a missing directory.

## Base Target

All targets inherit from `BaseTarget`:

```python
class BaseTarget(AutoRegistry, entry_point="target"):
    registry_key: ClassVar[str] = "kind"
    kind: str
    kind_name: ClassVar[str] = "Target"
    kind_description: ClassVar[str] = _("Base target")
    working_directory: str | None = None

    # --- placement identity (implement) ---
    @property
    @abstractmethod
    def location_id(self) -> str: ...

    @abstractmethod
    def access_cost(self, artifact: BaseArtifact) -> float | None: ...

    # --- base working directory, resolved at use time ---
    @property
    def resolved_working_directory(self) -> str: ...
    # raises WorkingDirectoryNotSetError when working_directory is None;
    # override to derive a default (LocalTarget falls back to the cwd)

    # --- dispatch lifecycle (concrete defaults; override only if needed) ---
    @final
    async def dispatch(self, task: BaseTask) -> None: ...   # PENDING + middleware
    async def _dispatch(self, task: BaseTask) -> None: ...  # create_task(task.run())
    async def wait(self) -> None: ...
    async def cancel(self) -> None: ...
    async def get_status(self) -> TaskStatus: ...
    async def recover(self, task) -> bool: return False    # reattach after restart

    # --- agentless channel: run_command is a template method ---
    async def run_command(self, cmd, *, cwd=None, env=None, detach=None) -> ChannelProcess: ...

    # implement these instead of overriding run_command (detach support)
    async def _run_command_sync(self, cmd, *, cwd, env) -> ChannelProcess: ...
    async def _launch(self, cmd, *, cwd, env, job_dir) -> JobHandle: ...
    async def _poll(self, handle) -> int | None: ...
    async def _read_output(self, handle) -> tuple[bytes, bytes]: ...
    async def _send_signal(self, handle, sig) -> None: ...

    # --- agentless channel (implement) ---
    @abstractmethod
    async def put_file(self, content, remote_path) -> None: ...
    @abstractmethod
    async def get_file(self, remote_path) -> bytes: ...
    @abstractmethod
    async def mkdir(self, path) -> None: ...
    @abstractmethod
    async def list_dir(self, path) -> list[RemoteDirEntry]: ...

    # --- filesystem primitives (POSIX-shell defaults; override natively) ---
    async def path_exists(self, path) -> bool: ...          # test -e <path>
    async def remove(self, path) -> None: ...               # rm -rf <path>
```

### Filesystem primitives

Alongside the channel, `BaseTarget` exposes two small filesystem primitives that
answer *does this path exist* and *remove this path* **on the target host**:

```python
async def path_exists(self, path: str) -> bool
async def remove(self, path: str) -> None
```

The base class provides POSIX-shell defaults (`test -e` and `rm -rf` run over
the channel), so remote targets work out of the box; `LocalTarget` overrides
them with native `pathlib` calls, and any target that can answer more directly
(SFTP, an agent API) should override them too.

Together with `run_command_sync`, `put_file`, `get_file`, `path_on_target`, and
`resolved_working_directory`, these primitives are exactly what the
[`ArtifactStore`](./artifact.md#artifactstore) and the target-agnostic
[`GenericTransfer`](./transfer.md#generictransfer) build on to check, delete, and
move artifacts wherever they physically live, no target-specific artifact logic
required.

### Contract

- `location_id`: stable URI-like identifier for the physical location
- `working_directory`: base directory **on the target host** where per-task
  working directories are created. It is `str | None` and defaults to `None`;
  read it through `resolved_working_directory`, never directly
- `resolved_working_directory`: the base directory as a concrete path, resolved
  at use time. The base contract **raises `WorkingDirectoryNotSetError`** when
  `working_directory` is `None`; a target that can derive a sensible default
  overrides this property (`LocalTarget` falls back to the process cwd). The
  workflow fills `working_directory` in for targets co-located with the
  orchestrator, so a target on a *different* machine (e.g. an SSH host) must be
  given one explicitly
- `dispatch()`: public `@final` entry point. Sets `task.status = PENDING`, runs
  `TargetMiddleware`, and delegates to `_dispatch()`
- `_dispatch()` / `wait()` / `cancel()` / `get_status()`: concrete defaults that
  run and drive `task.run()` on the orchestrator — override only for a
  fundamentally different dispatch model
- `run_command` / `put_file` / `get_file` / `mkdir` / `list_dir`: the agentless
  channel. `run_command` is a template method; a target implements the detach
  primitives (`_launch` / `_poll` / `_read_output` / `_send_signal` /
  `_run_command_sync`) instead of overriding it. See
  [Detachable Execution](./detaching.md). `list_dir` enumerates a target-side
  directory, used to collect side artifacts back to the orchestrator (see
  [Side Artifacts](./side-artifact.md))
- `access_cost()`: estimate the cost of reading an artifact from this target
- `recover(task)`: reconnect to a running job after the orchestrator process
  restarts, using the same detach primitives

`location_id` feeds the transfer system: two targets with the same
`location_id` share a filesystem, so the workflow can skip artifact copies
between them.

The channel methods are not middleware-wrapped today (channel-level middleware
and a pluggable, registry-keyed `BaseChannel` are on the roadmap).

### Kind metadata

Targets may expose `kind_name` and `kind_description` ClassVars to provide
human-friendly names and descriptions for registries and UIs. To make
descriptions translatable, use your plugin's own translator created with
`make_translator` (typically aliased as `_`) rather than importing
`horus_runtime`'s internal translator. See [SDK i18n guide](../i18n/index.md)
for the recommended pattern.

## Built-in Target

- `LocalTarget`: runs commands in the current machine

`LocalTarget` is the default target for `HorusTask`. It reports a stable
`location_id` like `local://hostname` and returns `0.0` access cost for local
file artifacts that already exist. Its channel implements `run_command` with
`asyncio.create_subprocess_shell(..., start_new_session=True)` so each command
leads its own process group; `ChannelProcess.kill()` then signals the whole
group (`os.killpg`), so a command that spawns children leaves no orphans.
`put_file` / `get_file` / `mkdir` map the remote paths to local paths, and
`list_dir` walks them with `pathlib`. It implements the detach primitives and
keeps the synchronous path as its default (`detach_by_default = False`), since
execution shares the orchestrator's machine. See
[Detachable Execution](./detaching.md).

## Remote Targets

Remote targets implement the same channel over a transport, so executors don't
change. The `horus_ssh` plugin provides `SSHTarget` (`kind="ssh"`): it runs
commands and moves files over a single persistent `asyncssh` connection
(`create_process` + SFTP) and **requires nothing on the remote host but the
binaries the command uses**. It implements `list_dir` over SFTP (no shell), so
side-artifact collection works the same as locally. It inherits the dispatch
lifecycle from `BaseTarget`. It detaches by default (`detach_by_default =
True`): commands run in their own session so they survive a dropped SSH
channel. See [Detachable Execution](./detaching.md).

Because an SSH host is a different machine than the orchestrator, an `SSHTarget`
must be given an explicit `working_directory` — the orchestrator only propagates
one to co-located targets, so without it `resolved_working_directory` raises
`WorkingDirectoryNotSetError`.

## Example

A local task:

```python
from horus_builtin.executor.shell import ShellExecutor
from horus_builtin.runtime.command import CommandRuntime
from horus_builtin.target.local import LocalTarget
from horus_builtin.task.horus_task import HorusTask

task = HorusTask(
    name="echo",
    target=LocalTarget(),
    executor=ShellExecutor(),
    runtime=CommandRuntime(command="echo 'hello world'"),
)
```

The same `ShellExecutor` + `CommandRuntime` runs on a remote host by swapping
the target. Here the command runs inside a Docker container on a remote SSH
host, and its output artifact is transferred back for a later local task to
consume — no Horus is installed on the remote:

```python
from horus_ssh.target.ssh_target import SSHTarget

remote = SSHTarget(
    host="gpu-box", username="carla", working_directory="/tmp/horus",
)

run_remote = HorusTask(
    name="run_remote",
    target=remote,
    executor=ShellExecutor(),
    runtime=CommandRuntime(
        command=(
            "docker run --rm "
            "-v {task.working_dir}:{task.working_dir} "
            "-w {task.working_dir} "
            "python:3.13-slim python {script.path}"
        ),
    ),
    inputs=[script_artifact],      # uploaded to the target by a transfer
    outputs=[result_artifact],     # produced on the remote, fetched back
)
```

When a workflow runs this task, it dispatches it to `task.target`, then waits
for the target to report completion. Inputs are moved to the target first, and
outputs are moved to wherever the next task needs them — see
[Transfer](./transfer.md).

## Registering Custom Targets

To register target plugins, expose them through:

```toml
[project.entry-points."horus.target"]
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/auto-registry/autoregistry.md).
