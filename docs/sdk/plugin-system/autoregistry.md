---
id: autoregistry
slug: /sdk/plugin-system/autoregistry
sidebar_position: 1
title: Auto-Registry & Plugin System
---

# Auto-Registry & Plugin System

The Horus Runtime SDK supports automatic artifact registration and a plugin system using Python entry points.

## Features

- Automatic discovery and registration of `Artifact`, `Tasks`, `Workflow` and `ArtifactSync` types
- Plugin support via `pyproject.toml` entry points
- Extensible architecture for third-party integrations

## How Auto-Registry Works

- Scans for entry points under a specific group (e.g., `horus.artifacts`)
- Loads and registers artifact classes automatically at runtime

## Setting Up Plugins

### 1. Define Entry Points in `pyproject.toml`

Add an entry under `[project.entry-points]`. For example, the built-in `File` and `Folder` artifacts
are exposed as:

```toml
# Built-in plugins
[project.entry-points."horus.artifacts"]
file = "horus_builtin.artifacts.file"
folder = "horus_builtin.artifacts.folder"
```

### 2. Install Your Package

Install your package in the same environment as Horus Runtime. The auto-registry will discover and register your artifact automatically.

## References

- See `horus_runtime.core.auto_registry` for implementation details.
- Python entry points documentation: https://packaging.python.org/en/latest/specifications/entry-points/
