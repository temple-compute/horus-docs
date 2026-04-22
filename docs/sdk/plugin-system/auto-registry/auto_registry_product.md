---
id: auto_registry_product
slug: /sdk/plugin-system/auto-registry-product
sidebar_position: 2
title: Auto-Registry Product
---

# Auto-Registry Product

`AutoRegistryProduct` is a mixin for `AutoRegistry` subclasses whose
discriminator key must be **composed** from the discriminator values of other
`AutoRegistry` types, rather than being a single, manually assigned string.

## Why It Exists

`AutoRegistry` normally identifies a concrete class by a static field like
`kind: str = "my_thing"`. That works perfectly when registration is keyed on
one dimension.

`BaseInteractionRenderer` needs to be keyed on **two** dimensions
simultaneously: which **transport** it handles and which **interaction** it
handles. The key must be a combination such as `"cli.text_prompt"`.

`AutoRegistryProduct` extracts that pattern into a generic mixin so that any
`AutoRegistry` subclass can declare a composite discriminator without
duplicating the resolution logic.

## How It Works

### `registry_key` Format

Instead of a bare field name, the base class declares `registry_key` in the
form:

```
"<field_name>:<attr1>.<attr2>…"
```

| Part | Meaning |
| --- | --- |
| `<field_name>` | The Pydantic field on the class that will hold the derived string key |
| `<attr1>`, `<attr2>` | `ClassVar` attributes on concrete subclasses whose values are other `AutoRegistry` subclasses |

At subclass definition time `AutoRegistryProduct.__init_subclass__` reads each
attribute, looks up its **`registry_key` field default** from Pydantic
`model_fields`, joins those defaults with `.`, writes the result to
`<field_name>`, and then delegates to `AutoRegistry.__init_subclass__` so
normal registration proceeds.

### MRO Ordering Requirement

`AutoRegistryProduct` **must appear before `AutoRegistry`** in the base list:

```python
class BaseInteractionRenderer(
    AutoRegistryProduct,   # runs first, derives the key
    AutoRegistry,          # runs second, reads the key and registers
    entry_point="interaction_renderer",
):
    ...
```

Python's MRO guarantees that `AutoRegistryProduct.__init_subclass__` commits
the derived key to the class _before_ `AutoRegistry.__init_subclass__` reads
it for registration.

### Step-by-Step Resolution

Given a concrete subclass:

```python
class MyCLITextRenderer(
    BaseInteractionRenderer[CLITransport, TextPromptInteraction]
):
    handles_transport: ClassVar[type[CLITransport]] = CLITransport
    handles_interaction: ClassVar[type[TextPromptInteraction]] = TextPromptInteraction

    async def render(self, transport, interaction): ...
```

1. `registry_key` on the base is `"render_key:handles_transport.handles_interaction"`.
2. `AutoRegistryProduct` splits on the first `:` → `field_name = "render_key"`, `raw_attrs = "handles_transport.handles_interaction"`.
3. For `handles_transport` → resolves to `CLITransport` → reads `CLITransport.registry_key` (in this renderer example, `"kind"`) → then reads `CLITransport.model_fields[CLITransport.registry_key].default` → e.g. `"cli"`.
4. For `handles_interaction` → resolves to `TextPromptInteraction` → reads `TextPromptInteraction.registry_key` (in this renderer example, `"kind"`) → then reads `TextPromptInteraction.model_fields[TextPromptInteraction.registry_key].default` → e.g. `"text_prompt"`.
5. Sets `cls.render_key = "cli.text_prompt"` and `cls.registry_key = "render_key"`.
6. `AutoRegistry.__init_subclass__` registers `MyCLITextRenderer` under the key `"cli.text_prompt"`.

## Error Cases

| Situation | Exception raised |
| --- | --- |
| Class uses `AutoRegistryProduct` without inheriting `AutoRegistry` | `TypeError` |
| `registry_key` does not contain `:` | `ValueError` |
| A referenced `ClassVar` attribute does not exist on the class | `ValueError` |
| The referenced `AutoRegistry` type has no non-empty string default for its registry key field | `ValueError` |

## Extending `AutoRegistryProduct`

Any base class that needs a composite key can adopt the same pattern:

```python
class BaseMyThing(
    AutoRegistryProduct,
    AutoRegistry,
    entry_point="my_thing",
):
    registry_key: ClassVar[str] = "key:source_a.source_b"
    key: str | None = None
    source_a: ClassVar[type[SomeRegistry]]  # concrete subclasses set this
    source_b: ClassVar[type[OtherRegistry]] # concrete subclasses set this
```

Concrete subclasses assign `source_a` and `source_b`; they never touch `key`
directly.
