---
id: intro
title: Horus Documentation
sidebar_label: Home
slug: /
---

# Horus

Horus is a workflow manager for HPC and the cloud. You describe a pipeline as a
set of tasks, in YAML or Python, and Horus runs them in dependency order. It
moves data between stages, sends each stage to the compute you point it at, and
shows live progress in your terminal.

## New to Horus? Start here

- [Installation](guides/installation.md): get the `horus` command.
- [Quickstart](guides/quickstart.mdx): write and run your first workflow.
- [Core concepts](guides/concepts.md): workflows, tasks, artifacts, and edges.
- [Examples](guides/examples.mdx): runnable workflows you can download and adapt.

## Writing and running workflows

- [Writing workflows (YAML)](guides/writing-workflows-yaml.mdx): the full schema,
  with a multi-task example.
- [Writing workflows (Python)](guides/writing-workflows-python.mdx): for tasks
  that need real logic or user prompts.
- [Running workflows](guides/running-workflows.md): the `horus run` command and
  the live dashboard.
- [Packaging workflows](guides/packaging-workflows.md): the `horus package`
  command, which zips a workflow and its inputs so it can run elsewhere.
- [Sanitizing workflows](guides/sanitizing-workflows.md): the `horus sanitize`
  command, which declares a workflow's implicit inputs so a UI can offer them.

## Building on Horus

- [Extending Horus](guides/extending.md): add your own artifact types, tasks,
  runtimes, targets, and interactions as plugins.
- [Runtime SDK](sdk/overview.md): the API reference for extending Horus with
  custom tasks, runtimes, targets, transfers, middleware, and plugins.
