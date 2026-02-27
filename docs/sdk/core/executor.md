---
sidebar_position: 2
title: Executor
---

# Executor System

Executors define where and how tasks run. They separate task logic (what to run) from execution environment (where to run it).

## Core Concept

Every executor implements:

```python
def execute(self, task: BaseTask) -> int:
    """
    Execute the given task, return exit code (0 = success)
    """
```

The workflow engine passes commands to executors and checks return codes. Same task can run locally or on a cluster by swapping executors.

### Contract

- Return `0` on success
- Return non-zero on failure
- Raise `ExecutionError` only for executor setup issues (not command failures)

## Built-in Executors

The SDK provides a standard executor implementation:

- `LocalExecutor` - Local command execution. Runs commands directly on host.

## Registering custom executors

To register and discover executor plugins within the Horus runtime use the following entry point:

```toml
[project.entry-points."horus.executors"]
```

For more details, refer to the [AutoRegistry documentation](../plugin-system/autoregistry.md).
