---
sidebar_position: 1
title: Artifact System
---

# Artifact System

The Artifact System is the **core execution mechanism** of the Horus Runtime SDK.

An _artifact_ represents a concrete unit of data produced or consumed by a task
(e.g. files, folders, datasets, models, serialized objects). Artifacts are not
just data containers — they define **task success, workflow state, and execution
status**.

In Horus, **artifacts are the single source of truth**. The workflow engine does
not track execution state explicitly. Instead, it derives execution state purely
from artifact existence and integrity.

## What Is an Artifact?

An artifact is a concrete representation of task input or output. Examples:

- Local files
- Folders
- Datasets
- Model checkpoints
- JSON / pickle / serialized objects
- Remote objects (e.g. S3, HTTP, registries)

Each artifact:

- Has a **unique ID**
- Has a **URI** describing its location
- Defines:
  - How to **check existence**
  - How to **materialize** itself locally
  - How to **compute a content hash** (determines if the artifact changed)

## Defining Custom Artifacts

Artifacts inherit from `BaseArtifact` and are automatically registered using the
runtime registry mechanism.

```python
from horus_runtime.core.artifact.base import BaseArtifact

class MyArtifact(BaseArtifact):

    # Utility subclasses can set False to
    # not include them in the registry
    add_to_registry = True

    ...
```

### Required Implementations

Every artifact must define:

- `exists()` → Does the artifact exist?
- `materialize()` → Ensure the artifact is locally available.
- `hash` → Deterministic content hash.

These three methods fully define the artifact’s runtime semantics.

## Artifact Resolution

Artifacts are resolved automatically at **workflow instantiation time** using:

- Pydantic validation
- The runtime artifact registry
- Type discrimination via the `kind` field

This allows workflows to declare artifacts declaratively without manually wiring
runtime resolution logic.

## Built-in Artifacts

The SDK provides standard artifact implementations:

- `FileArtifact` — Local file resources
- `FolderArtifact` — Local directory resources

These cover the majority of filesystem-based workflows and serve as reference
implementations for custom artifacts.
