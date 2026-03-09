---
sidebar_position: 4
title: Task
---

# Task System

Tasks define the logic and context for execution within the Horus workflow engine. They encapsulate inputs, outputs, variables, and specify the executor and runtime for execution.

## Core Concept

Every task implements:

```python
def run(self):
    """
    Run the task. Should be implemented by subclasses to define execution logic.
    """
```

The workflow engine uses tasks to manage execution, passing them to executors and runtimes. Tasks validate inputs, handle outputs, and manage execution context.

### Contract

- Implement `run()` to define execution logic
- Implement `is_complete` to define when the task is considered done (i.e. if all artifacts exist)
- Implement `reset` to reset the task state.
- Validate input artifacts before execution
- Raise errors for missing artifacts or failed execution
- The `kind` field declared on your task class (e.g. `kind: Literal["my_task"] = "my_task"`) is used by Pydantic as the discriminator in `TaskUnion`.

## Built-in Tasks

The SDK provides a standard task implementation:

- `HorusTask` - Basic Horus runtime task. Validates inputs and delegates execution to the executor and runtime.

### Example

```python
class HorusTask(BaseTask):
    kind: Literal["horus_task"] = "horus_task"

    def run(self) -> None:
        for input_name, artifact in self.inputs.items():
            if not artifact.exists():
                raise ArtifactDoesNotExistError(
                    f"Input artifact {input_name} does not exist"
                )
        return_code = self.executor.execute(self)
        if return_code != 0:
            raise TaskExecutionError(
                f"Task execution failed with return code {return_code}"
            )

    def is_complete(self) -> bool:
        """
        A HorusTask is considered complete if all of its output artifacts
        exist.
        """

        # If no outputs are declared, we consider the task incomplete and
        # always run it
        if not self.outputs:
            return False

        for artifact in self.outputs.values():
            if not artifact.exists():
                return False

        return True
```

## Base Task

All tasks inherit from `BaseTask`:

```python
class BaseTask(AutoRegistry, entry_point="task"):
    registry_key: ClassVar[str] = "kind"
    kind: Any = None
    inputs: dict[str, ArtifactUnion] = {}
    outputs: dict[str, ArtifactUnion] = {}
    variables: dict[str, Any] = {}
    executor: ExecutorUnion
    runtime: RuntimeUnion

    @abstractmethod
    def run(self) -> None:
        pass

    @abstractmethod
    def is_complete(self) -> bool:
        pass

    @abstractmethod
    def reset(self) -> None:
        pass

```

## Registering custom tasks

To register and discover task plugins within the Horus runtime, use the following entry point:

```toml
[project.entry-points."horus.task"]
```

For more details, refer to the [AutoRegistry documentation](../plugin-system/autoregistry.md).
