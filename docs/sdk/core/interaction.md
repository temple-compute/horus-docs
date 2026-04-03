---
sidebar_position: 6
title: Interaction
---

# Interaction System

Horus uses interactions for typed runtime prompting.

An interaction is made of three parts:

- an interaction model that describes the prompt and parses the result
- a transport that delivers the prompt to a frontend
- a renderer that connects a specific interaction type to a specific transport

## Core Concept

The core interaction model is `BaseInteraction[T]`:

```python
class BaseInteraction[T](AutoRegistry, entry_point="interaction"):
    registry_key: ClassVar[str] = "kind"

    kind: str
    value_key: str
    title: str | None = None
    prompt: str | None = None
    description: str | None = None
    default: T | None = None
    value: T | None = None

    @abstractmethod
    async def parse(self, value: object) -> T:
        ...
```

Each interaction:

- declares a `kind`
- describes what should be shown to the user
- parses raw renderer output into a typed value

## Transports and Renderers

`BaseInteractionTransport` is responsible for asking an interaction:

```python
result = await transport.ask(interaction, max_retries=3)
```

When `ask()` runs, Horus:

1. looks up the renderer for the transport and interaction pair
2. emits interaction lifecycle events
3. renders the prompt
4. parses the raw answer
5. retries on parse errors until `max_retries` is exhausted

Renderers are registered per transport/interaction pair through a derived key:

```text
<transport kind>:<interaction kind>
```

For example, the built-in CLI string renderer is registered as `cli:string`.

## Built-in Interactions

Horus currently includes these built-in interaction types:

- `StringInteraction`
- `ConfirmInteraction`
- `DropdownInteraction`
- `FileInteraction`

It also includes:

- `CLIInteractionTransport`
- CLI renderers for the built-in interactions above

## Task Integration

Interactions are task-oriented.

`BaseTask` has access to an interaction transport through the `interaction` field:

```python
interaction: BaseInteractionTransport | None = None
```

This allows task code to ask runtime questions through its configured
transport.

`FunctionTask` defaults this field to `CLIInteractionTransport()`, which makes
interactive code-first workflows straightforward to author.

## FunctionTask Example

```python
from horus_builtin.interaction.common.string import StringInteraction
from horus_builtin.task.function import FunctionTask
from horus_runtime.core.task.base import BaseTask


@FunctionTask.task(wf)
async def choose_dataset(task: BaseTask) -> None:
    assert task.interaction is not None

    dataset = await task.interaction.ask(
        StringInteraction(
            value_key="dataset-name",
            title="Dataset",
            prompt="Which dataset should be used?",
            default="sample",
        )
    )

    print(dataset)
```

## Interaction Events

The transport emits events during the interaction lifecycle:

- `InteractionAskedEvent`
- `InteractionAnsweredEvent`
- `InteractionRetryEvent`
- `InteractionFailedEvent`

These events integrate with the normal Horus event bus.

## Registering Custom Interaction Plugins

Custom interaction components are registered through Python entry points:

```toml
[project.entry-points."horus.interaction"]
common = "horus_builtin.interaction.common"

[project.entry-points."horus.interaction_transport"]
cli = "horus_builtin.interaction.cli"

[project.entry-points."horus.interaction_renderer"]
cli = "horus_builtin.interaction.cli"

```

Use:

- `horus.interaction` for interaction model types
- `horus.interaction_transport` for transports
- `horus.interaction_renderer` for renderers
