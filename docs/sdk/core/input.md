---
sidebar_position: 6
title: Input
---

# Input System

Workflows can request interactive values at runtime through an input provider.

This is useful for code-first or CLI-driven workflows that need to ask the user
for a path, a confirmation, a dataset name, or another runtime value before
continuing.

## Core Concept

Every input implementation provides:

```python
def ask(
    self,
    prompt: str,
    *,
    default: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str | None:
    ...
```

The implementation is expected to block until a value is available.

## Base Input

All input providers inherit from `BaseInput`:

```python
class BaseInput(AutoRegistry, entry_point="input"):
    registry_key: ClassVar[str] = "kind"
    kind: str

    @abstractmethod
    def ask(
        self,
        prompt: str,
        *,
        default: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str | None:
        pass
```

## Built-in Input

- `CLIInput`: prompts the user with Python's built-in `input()` function

## Workflow Integration

`BaseWorkflow` exposes an `input` field and defaults it to `CLIInput()`:

```python
from horus_builtin.workflow.horus_workflow import HorusWorkflow

wf = HorusWorkflow(name="demo")

value = wf.input.ask("Dataset name", default="sample")
```

## Registering Custom Inputs

To register an input plugin, expose it through:

```toml
[project.entry-points."horus.input"]
```

Example:

```toml
[project.entry-points."horus.input"]
web_form = "my_package.input.web_form"
```

Custom inputs can be used to integrate Horus workflows with other frontends,
such as GUIs, web applications, or remote prompting systems.
