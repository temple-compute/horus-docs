---
id: autoregistry
slug: /sdk/plugin-system/autoregistry
sidebar_position: 1
title: Auto-Registry
---

# Auto-Registry

The Horus Runtime SDK supports automatic registration and a plugin system using Python entry points.

## Features

- Automatic discovery and registration of `Artifact`, `Task`, `Runtime` and `Executor` types
- Plugin support via `pyproject.toml` entry points
- Extensible architecture for third-party integrations

## How Auto-Registry Works

- Scans for entry points under specific groups (see below)
- Loads and registers classes automatically at runtime

## Supported Entry Points

List the following entry point groups in your `pyproject.toml` to register plugins:

| Entry Point Group | Plugin Type      | Example Key  | Example Module                   |
| ----------------- | ---------------- | ------------ | -------------------------------- |
| `horus.artifacts` | Artifact plugins | `file`       | `horus_builtin.artifacts.file`   |
| `horus.tasks`     | Task plugins     | `horus_task` | `horus_builtin.tasks.horus_task` |
| `horus.runtimes`  | Runtime plugins  | `command`    | `horus_builtin.runtimes.command` |
| `horus.executors` | Executor plugins | `local`      | `horus_builtin.executors.local`  |

Below is the full entry-point configuration for `horus_builtin`:

```toml
[project.entry-points."horus.artifacts"]
# Artifact plugins
file = "horus_builtin.artifacts.file"
folder = "horus_builtin.artifacts.folder"

[project.entry-points."horus.tasks"]
# Task plugins
horus_task = "horus_builtin.tasks.horus_task"

[project.entry-points."horus.runtimes"]
# Runtime plugins
command = "horus_builtin.runtimes.command"

[project.entry-points."horus.executors"]
# Executor plugins
local = "horus_builtin.executors.local"
```

## Setting Up Plugins

### 1. Define Entry Points in `pyproject.toml`

Add your plugin under the appropriate entry point group. For example, to add a custom executor:

```toml
[project.entry-points."horus.executors"]
my_executor = "my_package.executors.my_executor"
```

### 2. Install Your Package

Install your package in the same environment as Horus Runtime. The auto-registry will discover and register your plugin automatically.

## References

- See `horus_runtime.core.auto_registry` for implementation details.
- Review the core implementations (`Artifact`, `Task`, `Runtime`, `Executor`, etc.) for specific entry point definitions used by the registry.
- Official Python entry points specification: https://packaging.python.org/en/latest/specifications/entry-points/
