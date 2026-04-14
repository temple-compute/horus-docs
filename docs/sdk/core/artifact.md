---
sidebar_position: 1
title: Artifact
---

# Artifact System

The Artifact System is part the **core execution mechanism** of the Horus Runtime SDK.

## What Is an Artifact?

An _artifact_ represents a concrete unit of data produced or consumed by a task.

**Every artifact is a file.** Regardless of what the artifact logically represents (a
Python dict, a trained model, a dataset) the runtime always
materializes it as a file on disk. This is a fundamental invariant: the `path` field is
not optional metadata, it is the canonical identity of the artifact. Existence means the
file exists; integrity means the file hash matches.

This constraint makes artifacts deterministic, cacheable, and transportable across
machines without any special serialization protocol at the workflow level.

Examples of what artifacts can represent (and how they materialize):

- Local files and folders (stored as-is)
- Python dicts, lists, and other JSON-compatible objects (serialized to a `.json` file)
- Arbitrary Python objects (serialized to a `.pkl` file via pickle)
- Datasets and model checkpoints (stored as files or directories)
- Remote objects such as S3 or HTTP resources (downloaded and cached locally before use)

Each artifact:

- Has a **unique ID**
- Has a **path** identifying its location on disk
- Defines:
  - How to **check existence**
  - How to **read** its contents back into a Python object
  - How to **write** a Python object to its file representation
  - How to **compute a content hash** (determines if the artifact changed)

## Defining Custom Artifacts

Artifacts inherit from `BaseArtifact` and are automatically registered using the
runtime registry mechanism.

```python
from horus_runtime.core.artifact.base import BaseArtifact

class MyArtifact(BaseArtifact[str]):
    kind = "my_artifact"

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
- **Hashing**: Provides a `hash` property (SHA-256 of file contents) and a static `hash_file(path)` method.
- **Required implementations**:
  - `read() -> T`: Read and deserialize the artifact contents.
  - `write(value: T) -> None`: Write the native representation to disk.
  - `kind: str`: Concrete discriminator value used for registry dispatch and type resolution.
- **Provided implementations**:
  - `exists() -> bool`: Returns whether the path exists on disk.
  - `delete()`: Removes the file and emits a delete event.
  - `package() / unpackage()`: Artifact transport helpers.

## Built-in Artifacts

The SDK provides the following artifact implementations:

### `FileArtifact`

Reads and writes raw bytes. Suitable for any opaque file.

```python
from horus_builtin.artifact.file import FileArtifact
```

### `FolderArtifact`

Represents a local directory. Existence is checked via `path.is_dir()`.

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

For more details, refer to the [AutoRegistry documentation](../plugin-system/autoregistry.md).
