---
id: autoregistry
slug: /sdk/plugin-system/autoregistry
sidebar_position: 1
title: Auto-Registry
---

# Auto-Registry

The Horus Runtime SDK supports automatic registration and a plugin system using Python entry points.

## Features

- Automatic discovery and registration of `Artifact`, `Task`, `Runtime`, `Executor`, and `Workflow` types
- Plugin support via `pyproject.toml` entry points
- Extensible architecture for third-party integrations

## How Auto-Registry Works

The `AutoRegistry` system automatically discovers and registers plugin implementations at runtime.

It works by:

- Scanning Python entry points under specific groups
- Importing the corresponding modules
- Registering classes that inherit from the appropriate base classes

This allows Horus to dynamically load plugins without requiring manual imports or configuration.

## The `kind` Field and Pydantic Discriminator

Every registrable base class (`BaseArtifact`, `BaseTask`, `BaseRuntime`, `BaseExecutor`, `BaseWorkflow`) declares:

```python
registry_key: ClassVar[str] = "kind"
kind: Any = None
```

The `registry_key` tells `AutoRegistry` which field to use as the lookup key.

Concrete implementations narrow `kind` to a `Literal` type:

```python
class HorusTask(BaseTask):
    kind: Literal["horus_task"] = "horus_task"
```

This same `kind` field is also used as the **Pydantic discriminator**. When Horus deserializes a raw dictionary into a model, Pydantic reads the `kind` field to determine which concrete class to instantiate.

## Supported Entry Points

Plugins are exposed through Python entry points defined in `pyproject.toml`.

| Entry Point Group | Plugin Type      | Example Key      | Example Module                          |
| ----------------- | ---------------- | ---------------- | --------------------------------------- |
| `horus.artifact`  | Artifact plugins | `file`           | `horus_builtin.artifact.file`           |
| `horus.task`      | Task plugins     | `horus_task`     | `horus_builtin.task.horus_task`         |
| `horus.runtime`   | Runtime plugins  | `command`        | `horus_builtin.runtime.command`         |
| `horus.executor`  | Executor plugins | `local`          | `horus_builtin.executor.local`          |
| `horus.workflow`  | Workflow plugins | `horus_workflow` | `horus_builtin.workflow.horus_workflow` |

Below is the entry-point configuration used by `horus_builtin`:

```toml
[project.entry-points."horus.artifact"]
file = "horus_builtin.artifact.file"
folder = "horus_builtin.artifact.folder"

[project.entry-points."horus.task"]
horus_task = "horus_builtin.task.horus_task"

[project.entry-points."horus.runtime"]
command = "horus_builtin.runtime.command"

[project.entry-points."horus.executor"]
local = "horus_builtin.executor.local"

[project.entry-points."horus.workflow"]
horus_workflow = "horus_builtin.workflow.horus_workflow"
```

## Setting Up Plugins

### 1. Define Entry Points in `pyproject.toml`

Add your plugin under the appropriate entry point group. For example:

```toml
[project.entry-points."horus.executor"]
my_executor = "my_package.executor.my_executor"
```

### 2. Install Your Package

Install your package in the same environment as Horus Runtime. The auto-registry will discover and register your plugin automatically at runtime.

## Custom Registry and Entry Points

Some base classes in Horus (such as `BaseRuntime`, `BaseTask`, etc.) already inherit from `AutoRegistry` and define the entry point group internally.

However, if you create a class that **directly inherits from `AutoRegistry`**, you must explicitly specify the `entry_point` parameter. This parameter determines which entry point group the registry will scan for implementations.

For example, the `BaseRuntime` class declares its entry point as `"runtime"`:

```python
class BaseRuntime(AutoRegistry, entry_point="runtime"):
    """
    The base runtime. This class provides the foundational functionality for
    executing tasks, and should be ingested by the executor.
    """
    registry_key: ClassVar[str] = "kind"
    kind: Any = ...
```

Concrete implementations of this registry are then discovered from the corresponding entry point group.

### Creating a Custom Registry

You can also define your own registry by inheriting directly from `AutoRegistry`.

Example:

```python
class MyCustomPluginRegistry(AutoRegistry, entry_point="custom"):
    registry_key: ClassVar[str] = "plugin_type"
    plugin_type: Any = ...
```

Concrete implementations must define the discriminator field:

```python
class MyPlugin(MyCustomPluginRegistry):
    plugin_type: Literal["my_plugin"] = "my_plugin"
```

### Registering Custom Plugins

Expose implementations through `pyproject.toml`:

```toml
[project.entry-points."horus.custom"]
my_plugin = "my_package.my_plugin"
```

At runtime, `AutoRegistry` will discover and register all implementations automatically.

## References

- See `horus_runtime.core.auto_registry` for implementation details.
- Review the core implementations (`Artifact`, `Task`, `Runtime`, `Executor`, etc.) for examples of registry definitions.
- Official Python entry points specification:
  [https://packaging.python.org/en/latest/specifications/entry-points/](https://packaging.python.org/en/latest/specifications/entry-points/)
