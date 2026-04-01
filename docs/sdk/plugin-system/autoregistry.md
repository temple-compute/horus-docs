---
id: autoregistry
slug: /sdk/plugin-system/autoregistry
sidebar_position: 1
title: Auto-Registry
---

# Auto-Registry

The Horus Runtime SDK supports automatic registration and plugin discovery
through Python entry points.

## Features

- Automatic discovery of `Artifact`, `Task`, `Runtime`, `Executor`, `Workflow`,
  and `Input` types
- Pydantic-backed discriminator lookup using `kind`
- Extensible architecture for third-party integrations

## How Auto-Registry Works

`AutoRegistry` discovers implementations by:

- scanning Python entry points under a Horus namespace
- importing the referenced modules
- registering concrete subclasses under their discriminator value

This lets Horus load plugins dynamically without a central import list.

## The `kind` Field

Every registrable base class declares:

```python
registry_key: ClassVar[str] = "kind"
kind: str
```

Concrete implementations then assign a concrete string value:

```python
class HorusTask(BaseTask):
    kind: str = "horus_task"
```

That same `kind` field is used to choose the concrete class during model
validation and deserialization.

## Generic Subclasses

Horus supports registrable generic base classes such as `BaseRuntime[T]`.

Concrete subclasses of parameterized generics are registered normally. The
registry now skips only synthetic class names that contain `[` rather than
skipping all subclasses of parameterized generics. This allows classes like
`CommandRuntime(BaseRuntime[str])` and `PythonFunctionRuntime(BaseRuntime[Callable[..., Any]])`
to be discovered correctly.

## Supported Entry Points

Plugins are exposed through Python entry points in `pyproject.toml`.

| Entry Point Group | Plugin Type      | Example Key      | Example Module                        |
| ----------------- | ---------------- | ---------------- | ------------------------------------- |
| `horus.artifact`  | Artifact plugins | `file`           | `horus_builtin.artifact.file`         |
| `horus.task`      | Task plugins     | `horus_task`     | `horus_builtin.task.horus_task`       |
| `horus.runtime`   | Runtime plugins  | `command`        | `horus_builtin.runtime.command`       |
| `horus.executor`  | Executor plugins | `shell`          | `horus_builtin.executor.shell`        |
| `horus.workflow`  | Workflow plugins | `horus_workflow` | `horus_builtin.workflow.horus_workflow` |
| `horus.input`     | Input plugins    | `cli`            | `horus_builtin.input.cli`             |

Example built-in configuration:

```toml
[project.entry-points."horus.artifact"]
file = "horus_builtin.artifact.file"
folder = "horus_builtin.artifact.folder"

[project.entry-points."horus.executor"]
shell = "horus_builtin.executor.shell"
python_exec = "horus_builtin.executor.python_exec"
python_fn = "horus_builtin.executor.python_fn"

[project.entry-points."horus.runtime"]
command = "horus_builtin.runtime.command"
python_string = "horus_builtin.runtime.python_string"
python = "horus_builtin.runtime.python"

[project.entry-points."horus.task"]
horus_task = "horus_builtin.task.horus_task"

[project.entry-points."horus.workflow"]
horus_workflow = "horus_builtin.workflow.horus_workflow"

[project.entry-points."horus.input"]
cli = "horus_builtin.input.cli"
```

## Setting Up Plugins

### 1. Define Entry Points

For example:

```toml
[project.entry-points."horus.executor"]
my_executor = "my_package.executor.my_executor"
```

### 2. Install the Package

Install the package in the same environment as Horus Runtime. The registry will
discover it automatically.

## Custom Registries

If you inherit directly from `AutoRegistry`, you must supply `entry_point`:

```python
class MyRuntime(AutoRegistry, entry_point="runtime"):
    registry_key: ClassVar[str] = "kind"
    kind: str
```

`AutoRegistry` prefixes the group internally, so:

- Class definition: `entry_point="runtime"`
- `pyproject.toml`: `"horus.runtime"`

## References

- Python entry points specification:
  [packaging.python.org](https://packaging.python.org/en/latest/specifications/entry-points/)
