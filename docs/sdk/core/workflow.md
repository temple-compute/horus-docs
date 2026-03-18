---
sidebar_position: 5
title: Workflow
---

# Workflow System

Workflows orchestrate an ordered set of tasks within the Horus runtime engine.

## Core Concept

Every workflow implements the following methods:

```python
@classmethod
def from_yaml(cls, path: str | Path) -> "BaseWorkflow":
    """
    Load a workflow from a YAML file.
    """

def run(self) -> None:
    """
    Execute the workflow.
    """

def reset(self) -> None:
    """
    Reset the workflow by resetting all tasks.
    """
```

One could subclass the `BaseWorkflow` to provide dependency resolution, and other execution pipelines.

### Contract

- Implement `from_yaml()` to load a workflow from a YAML file
- Implement `run()` to define execution order and skip logic
- Implement `reset()` to clean up task outputs and allow re-execution
- The `kind` field declared on your workflow class (e.g. `kind: Literal["my_workflow"] = "my_workflow"`) is used by Pydantic as the discriminator in `WorkflowUnion`.

## Base Workflow

All workflows inherit from `BaseWorkflow`:

```python
class BaseWorkflow(AutoRegistry, entry_point="workflow"):
    registry_key: ClassVar[str] = "kind"
    kind: Any = None
    name: str
    tasks: dict[str, TaskUnion]

    @classmethod
    @abstractmethod
    def from_yaml(cls, path: str | Path) -> "BaseWorkflow":
        pass

    @abstractmethod
    def run(self) -> None:
        pass

    @abstractmethod
    def reset(self) -> None:
        pass
```

## Built-in Workflows

The SDK provides a standard workflow implementation:

- `HorusWorkflow` - Basic Horus runtime workflow. Executes tasks in definition order, skipping any task whose output artifacts already exist.

### Example

```python
class HorusWorkflow(BaseWorkflow):
    kind: Literal["horus_workflow"] = "horus_workflow"

    @classmethod
    def from_yaml(cls, path: str | Path) -> "HorusWorkflow":
        with Path(path).open("r", encoding="utf-8") as fh:
            return cls.model_validate(yaml.safe_load(fh))

    def run(self) -> None:
        for task in self.tasks.values():
            if task.is_complete():
                continue

            task.run()

    def reset(self) -> None:
        for task in self.tasks.values():
            task.reset()
```

## Registering custom workflows

To register and discover workflow plugins within the Horus runtime, use the following entry point:

```toml
[project.entry-points."horus.workflow"]
```

For more details, refer to the [AutoRegistry documentation](../plugin-system/autoregistry.md).
