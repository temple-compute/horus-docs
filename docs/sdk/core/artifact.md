---
sidebar_position: 1
title: Artifact
---

# Artifact System

The Artifact System is part of the **core execution mechanism** of the Horus Runtime SDK.

## What Is an Artifact?

An _artifact_ represents a concrete unit of data produced or consumed by a task.

**Every artifact is backed by a filesystem path.** Regardless of what the artifact
logically represents (a Python dict, a trained model, a dataset) the runtime always
materializes it on disk as either a file or a directory. This is a fundamental
invariant: the `path` field is not optional metadata, it is the canonical identity of
the artifact: existence means the path exists on the target where the artifact
lives (checked through the [`ArtifactStore`](#artifactstore), not by the artifact
itself).

This constraint makes artifacts deterministic, cacheable, and transportable across
machines without any special serialization protocol at the workflow level.

Examples of what artifacts can represent (and how they materialize):

- Local files and folders (stored as-is)
- Python dicts, lists, and other JSON-compatible objects (serialized to a `.json` file)
- Arbitrary Python objects (serialized to a `.pkl` file via pickle)
- Datasets and model checkpoints (stored as files or directories)
- Remote objects such as S3 or HTTP resources (downloaded and cached locally before use)

Each artifact:

- Has a stable **ID**. The `id` identifies the artifact within its task and is
  the handle that workflow **edges** wire together (a producer output to a
  consumer input). Tasks are not linked by matching `id`s — an explicit edge
  does the wiring — so a producer output and the consumer input it feeds may
  have different `id`s. Within a single task, input and output `id`s must be
  unique (see [DAG planning](./workflow.md#dag-planning) and
  [edges](./workflow.md#edges)).
- Has a **path** identifying its location on disk
- Defines:
  - How to **read** its contents back into a Python object
  - How to **write** a Python object to its file representation
  - How to **package / unpackage** itself for transport, as portable shell
    commands (see `pack_command` / `unpack_command` below)

Filesystem lifecycle operations (existence checks, deletion, packaging) are
**not** performed by the artifact itself. They run through the
[`ArtifactStore`](#artifactstore) against the target where the artifact
physically lives, so they behave identically whether that is the orchestrator
or a remote machine.

## Defining Custom Artifacts

Artifacts inherit from `BaseArtifact` and are automatically registered using the
runtime registry mechanism.

```python
from horus_runtime.core.artifact.base import BaseArtifact

class MyArtifact(BaseArtifact[str]):
    kind = "my_artifact"
    kind_name = "My Artifact"
    kind_description = "A short, human-readable description of this kind."

    def read(self) -> str:
        with open(self.path) as f:
            return f.read()

    def write(self, value: str) -> None:
        with open(self.path, "w") as f:
            f.write(value)
```

### BaseArtifact API and Required Implementations

`BaseArtifact[T]` is a generic, file-backed artifact abstraction:

- **Generic type**: `BaseArtifact[T]` specifies the native Python type that `read()` returns and `write()` accepts.
- **Path normalization**: Accepts both `str` and `Path` for `path`, always resolved to an absolute `Path`.
- **ID logic**: Each artifact has a unique `internal_id` (UUID) and a user-friendly `id` (auto-set if not provided).
- **Event emission**: Emits lifecycle events via the runtime event bus.
- **Required implementations**:
  - `read() -> T`: Read and deserialize the artifact contents. Runs task-local,
    on the machine where the value is produced or consumed.
  - `write(value: T) -> None`: Write the native representation to disk (also
    task-local).
  - `kind: str`: Concrete discriminator value used for registry dispatch and type resolution.
- **Kind metadata** (optional ClassVars):
  - `kind_name: ClassVar[str]`: short, human-readable name for the kind (e.g. `"File"`), used by client UIs, registries, and logging.
  - `kind_description: ClassVar[str]`: a longer description of the kind. Defaults to an empty string. For translatable text, prefer a plugin-scoped translator (see the [SDK i18n guide](../i18n/index.md)).
- **Transport hooks** (override only when the artifact is not a single file):
  - `pack_command(src, pkg) -> str | None`: return a portable shell command that
    produces the single-file package `pkg` from the artifact materialized at
    `src`, or `None` when the artifact is already a single file (identity
    packaging — the base default).
  - `unpack_command(pkg, dest) -> str | None`: return a portable shell command
    that materializes the artifact at `dest` from the package `pkg`, or `None`
    for identity (the store simply moves the file into place).

  Both commands are executed on the target where the artifact lives (or is being
  materialized) by the [`ArtifactStore`](#artifactstore), so they must be
  POSIX-portable and reference only the given target-side paths. `FileArtifact`
  and other single-file artifacts inherit the identity defaults;
  `FolderArtifact` overrides them with `tar` commands.

## `ArtifactStore`

An artifact is just a file-backed value description; **where** it lives, and how
to check, delete, or transport it there, is owned by a target. The
`ArtifactStore` (`horus_runtime.core.artifact.store`) is the mediator that binds
an artifact to a target and performs its lifecycle operations through that
target's filesystem primitives:

```python
from horus_runtime.core.artifact.store import ArtifactStore

store = ArtifactStore(target)

await store.exists(artifact)                 # -> bool
await store.delete(artifact)                 # remove + emit delete event
package_path = await store.package(artifact) # build a single transferable file
await store.unpackage(artifact, package_path)
```

Because every operation runs through the target rather than local `pathlib`
calls, the *same* code checks and moves an artifact whether it physically lives
on the orchestrator or on a remote (e.g. SSH) machine. `package()` runs the
artifact's `pack_command` on the target and returns the package path (or the
artifact's own path unchanged for single-file, identity artifacts);
`unpackage()` runs `unpack_command` on the destination, or simply moves the file
into place for identity artifacts.

`ArtifactStore` depends only on a small set of methods
(`path_on_target`, `path_exists`, `remove`, `run_command_sync`,
`resolved_working_directory`) that `BaseTarget` satisfies. See
[Target](./target.md#filesystem-primitives) for those primitives.

## Built-in Artifacts

The SDK provides the following artifact implementations:

### `FileArtifact`

Reads and writes raw bytes. Suitable for any opaque file.

```python
from horus_builtin.artifact.file import FileArtifact
```

### `FolderArtifact`

Represents a directory. It overrides the transport hooks so a whole directory
can move between targets as a single file: `pack_command` archives the folder's
contents with `tar czf … -C <src> .` and `unpack_command` extracts them with
`tar xzf` into a freshly recreated destination.

```python
from horus_builtin.artifact.folder import FolderArtifact
```

### `JSONArtifact[T]`

Serializes any JSON-compatible Python object (`dict`, `list`, `str`, etc.) to a `.json` file.
The generic parameter `T` is used for type-checking only; no runtime validation is performed.

```python
from horus_builtin.artifact.json import JSONArtifact

artifact = JSONArtifact[dict](path="/tmp/result.json")
artifact.write({"key": "value"})
data = artifact.read()  # dict, cast to T
```

### `PickleArtifact[T]`

Serializes arbitrary Python objects using the `pickle` protocol.

```python
from horus_builtin.artifact.pickle import PickleArtifact

artifact = PickleArtifact[list](path="/tmp/data.pkl")
artifact.write([1, 2, 3])
data = artifact.read()  # list
```

> **Warning:** pickle is not secure against malformed or maliciously crafted data.
> Never unpickle data from untrusted sources.


## Registering custom artifacts

To register and discover artifact plugins within the Horus runtime use the following entry point:

```toml
[project.entry-points."horus.artifact"]
```

For more details, refer to the [AutoRegistry documentation](../plugin-system/auto-registry/autoregistry.md).
