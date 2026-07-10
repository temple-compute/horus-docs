---
sidebar_position: 7
title: Transfer Strategy
---

# Transfer Strategy

Transfer strategies move artifacts between targets so that each task can access
its inputs regardless of where it runs.

## Why Transfer Strategies Exist

When every task runs locally there is nothing to move: all tasks share a
filesystem. As soon as a task runs on a remote target, its input artifacts may
live somewhere the target cannot reach directly.

Rather than embedding movement logic inside the target or the workflow, Horus
separates the concern into a standalone `BaseTransferStrategy`. This keeps
targets focused on dispatch and workflow code focused on orchestration.

## How Transfers Fit Into Execution

Before dispatching each task the workflow calls `transfer_artifacts()`, which:

1. determines the source target for each input artifact
2. looks up the registered strategy for the `(source, destination)` target pair,
   falling back to the target-agnostic [`GenericTransfer`](#generictransfer) when
   none is registered
3. calls `strategy.transfer(artifact, source, destination)`

## Base Transfer Strategy

All strategies inherit from `BaseTransferStrategy`:

```python
class BaseTransferStrategy[S: BaseTarget, D: BaseTarget](
    AutoRegistryProduct,
    AutoRegistry,
    entry_point="transfer",
):
    registry_key: ClassVar[str] = "transfer_key:handles_source.handles_destination"
    transfer_key: str | None = None
    handles_source: ClassVar[type[BaseTarget]]
    handles_destination: ClassVar[type[BaseTarget]]

    @final
    async def transfer(
        self,
        artifact: BaseArtifact,
        source: S,
        destination: D,
    ) -> None:
        ...

    @abstractmethod
    async def _transfer(
        self,
        artifact: BaseArtifact,
        source: S,
        destination: D,
    ) -> None:
        ...
```

### Contract

- `handles_source`: the target type this strategy reads from
- `handles_destination`: the target type this strategy writes to
- `transfer_key`: derived automatically; do not set manually
- implement `_transfer()`, not `transfer()`
- `transfer()` is the public `final` entry point and runs `TransferMiddleware`

`transfer_key` is composed automatically from `handles_source.kind` and
`handles_destination.kind`, joined with `.`.

## Registration

`BaseTransferStrategy` uses `AutoRegistryProduct` so the registry key is a
composite of the two target `kind` defaults:

```python
class MyTransfer(BaseTransferStrategy[LocalTarget, SSHTarget]):
    handles_source = LocalTarget
    handles_destination = SSHTarget

    async def _transfer(self, artifact, source, destination) -> None:
        ...
```

The registry key such as `"local.ssh"` is derived automatically at class
definition time.

## Lookup

The workflow resolves a strategy at runtime using `get_from_registry()`. A
registered strategy for the exact `(source, destination)` pair always wins; when
none is found, the workflow falls back to [`GenericTransfer`](#generictransfer)
rather than failing:

```python
strategy = BaseTransferStrategy.get_from_registry(source_target, task.target)
if strategy is None:
    strategy = GenericTransfer()  # target-agnostic fallback

await strategy.transfer(artifact, source_target, task.target)
```

## Built-in Strategies

### `LocalNoOpTransfer`

Handles `LocalTarget -> LocalTarget` transfers.

When both the producing task and the consuming task run on the same local
machine, the artifact is already on a shared filesystem and no movement is
needed.

```python
from horus_builtin.transfer.local_noop import LocalNoOpTransfer


class LocalNoOpTransfer(BaseTransferStrategy):
    handles_source = LocalTarget
    handles_destination = LocalTarget

    async def _transfer(self, artifact, source, destination) -> None:
        pass
```

### `GenericTransfer`

`GenericTransfer` (`horus_runtime.core.transfer.generic`) is the **target-agnostic
fallback**. It moves an artifact between *any* two targets using only the shared
filesystem primitives every target implements, so a new target kind can transfer
artifacts to and from anywhere without anyone writing a location-specific
strategy for it.

Its `_transfer()`:

1. **short-circuits** when both targets report the same `location_id` (they share
   a filesystem, so nothing is copied, the artifact path is just repointed);
2. otherwise **packages** the artifact on the source (via
   [`ArtifactStore`](./artifact.md#artifactstore)), streams the single package
   file through the orchestrator with `get_file` → `put_file`, and **unpackages**
   it on the destination:

   ```text
   package → get_file → put_file → unpackage
   ```

`GenericTransfer` is not registered by key (`add_to_registry = False`); the
workflow uses it directly only when no specific strategy is found. Registered
strategies (like `LocalNoOpTransfer` or a plugin's SSH transfer) therefore always
take precedence, so you only write a custom strategy when you need transport that
is faster or smarter than the generic package-and-stream path.

## Exceptions

| Exception | When raised |
| --- | --- |
| `TransferStrategyNotFoundError` | No registered strategy handles the resolved `(source, destination)` target pair |
| `OrchestratorTargetNotSetError` | A root input artifact needs a source but `workflow.orchestrator_target` is `None` |

Both are subclasses of `TransferError`.

## Implementing a Custom Strategy

```python
from horus_runtime.core.artifact.base import BaseArtifact
from horus_runtime.core.transfer.strategy import BaseTransferStrategy
from my_plugin.target.ssh import SSHTarget
from horus_builtin.target.local import LocalTarget


class LocalToSSHTransfer(BaseTransferStrategy[LocalTarget, SSHTarget]):
    handles_source = LocalTarget
    handles_destination = SSHTarget

    async def _transfer(
        self,
        artifact: BaseArtifact,
        source: LocalTarget,
        destination: SSHTarget,
    ) -> None:
        # Upload artifact.path to destination's working_directory over SCP
        ...
```

## Registering Custom Strategies

Expose the strategy through a `horus.transfer` entry point:

```toml
[project.entry-points."horus.transfer"]
local_to_ssh = "my_plugin.transfer.local_ssh"
```

For more details, refer to the [Auto-Registry documentation](../plugin-system/auto-registry/autoregistry.md) and the
[Auto-Registry Product documentation](../plugin-system/auto-registry/auto_registry_product.md).
