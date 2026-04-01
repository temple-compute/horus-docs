---
title: Overview
sidebar_position: 1
---

# Runtime SDK

The Horus runtime provides an extensible SDK for defining artifacts, runtimes,
executors, tasks, workflows, and interactive inputs.

## Core Abstractions

- [Artifact](./core/artifact.md)
- [Executor](./core/executor.md)
- [Runtime](./core/runtime.md)
- [Task](./core/task.md)
- [FunctionTask](./core/function-task.md)
- [Input](./core/input.md)
- [Workflow](./core/workflow.md)

## Plugin System

- [Auto-Registry](./plugin-system/autoregistry.md)

## Features

- Extensible plugin system via Python entry points
- Artifact-driven workflow execution
- Shell-based and Python-native task execution
- Code-first workflows with `FunctionTask`
- Interactive workflow input support
- [Internationalization (i18n)](i18n.md)
