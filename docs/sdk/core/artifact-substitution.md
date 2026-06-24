---
sidebar_position: 3.5
title: Artifact Substitution
---

# Artifact Substitution

Most runtimes let a task body reference its artifacts by **id**, and resolve
each reference to the artifact's path *on the target the task runs on*
(`target.path_on_target(artifact)`). Write the body once and it runs unchanged
whether the task lands on a local or remote target.

The **key is always the artifact `id`** — both inputs and outputs are exposed.
What changes between runtimes is the **placeholder syntax**. Using the wrong
syntax silently leaves the placeholder untouched.

## At a glance

| Runtime (`kind`)        | Syntax                         | Resolves to                              | Notes |
| ----------------------- | ------------------------------ | ---------------------------------------- | ----- |
| `command`               | `{id}`, `{id.path}`, `{task.*}`| on-target path of the artifact `id`      | `str.format`; full attribute access |
| `python_script`         | `{id}` — **in `args` only**    | on-target path                           | the `.py` file is shipped as-is, not templated |
| `python` (code string)  | `$id`, `${id}`                 | on-target path (a string)                | `string.Template`; **`{}` is left untouched** |
| `python_function`       | parameter named `id`           | the `BaseArtifact` object (use `.path`)  | injected as a kwarg, not string templating |

:::warning Match the syntax to the runtime
A `python` code task uses `$id`, **not** `{id}`. Braces are intentionally left
alone so Python dict/f-string/set literals survive. If you write `"{input}"` in
a Python code task it is treated as a literal string, not a path.
:::

## `command` — `{id}` (and `{id.path}`, `{task.*}`)

The command string is rendered with `str.format`. Each artifact id becomes a
field; `{id}` is the on-target path, and attributes forward to the artifact
(`{id.path}`, `{id.id}`, `{id.kind}`). A `task` namespace exposes task fields
and artifacts (`{task.name}`, `{task.<id>.path}`).

```python
from horus_builtin.runtime.command import CommandRuntime

CommandRuntime(
    command="python process.py --in {pdb_in} --out {result} --tag {task.name}",
)
```

Given an input `pdb_in` and output `result`, this renders to e.g.
`python process.py --in /work/abc/pdb_in.txt --out /work/abc/result.json --tag step1`.

:::info Reserved id
`task` is reserved for the command namespace — an artifact with `id: task`
raises a `ValueError`. Pick another id.
:::

## `python_script` — `{id}` in `args`

`python_script` ships a local `.py` file to the target and runs it. The **script
file is not templated** (it is your real source). Pass artifact paths through
`args`, which is rendered exactly like a `command`:

```python
from horus_builtin.runtime.python_script import PythonScriptRuntime

PythonScriptRuntime(
    script="scripts/process.py",
    args="--in {pdb_in} --out {result}",
)
```

Inside `process.py`, read the paths from `argv` (e.g. with `argparse`).

## `python` — `$id` / `${id}`

The `PythonCodeStringRuntime` runs an inline code string. It substitutes with
`string.Template`, so placeholders use `$id` (or `${id}` when a letter or digit
follows the name). Python's own `{}` — dict/set literals, f-strings,
comprehensions — is left untouched. Unknown `$name` references are left as-is.

```python
from horus_builtin.runtime.python_string import PythonCodeStringRuntime

PythonCodeStringRuntime(
    code=(
        "with open('$pdb_in') as f:\n"
        "    first = f.read().split('\\n')[0]\n"
        "with open('${result}') as f2:\n"
        "    f2.write(first)\n"
    ),
)
```

:::warning Ids must be valid identifiers here
`string.Template` only matches `[A-Za-z_][A-Za-z0-9_]*`, so a hyphen breaks
substitution — `$pdb-in` resolves `$pdb` then the literal `-in`, and
`${pdb-in}` does not match at all. Use `snake_case` ids (`pdb_in`, not
`pdb-in`).
:::

## `python_function` — injected as parameters

`PythonFunctionRuntime` does not do string templating. It inspects the
callable's signature and injects each artifact as a keyword argument named after
its `id` (plus the `task` itself). Access the path with `.path`:

```python
from horus_builtin.runtime.python import PythonFunctionRuntime

def process(pdb_in, result, task):
    first = pdb_in.path.read_text().split("\n")[0]
    result.path.write_text(first)

PythonFunctionRuntime(func=process)
```

If the function does not declare `**kwargs`, every parameter must be satisfiable
from the available artifacts/`task` — otherwise `_setup_runtime()` raises a
`ValueError` naming the missing parameters. Parameter names must therefore match
artifact ids, so ids must be valid Python identifiers.

## Choosing ids

- Prefer `snake_case`, identifier-safe ids (`pdb_in`, `result`) — they work in
  every runtime. Hyphens and spaces only work in `command`/`python_script` and
  break `python`/`python_function`.
- The id is the contract between the workflow definition and the body; a display
  name (if your tooling has one) is cosmetic and is **not** used for
  substitution.

## Common pitfall

A `python` code task that uses `{}` instead of `$`:

```python
# ❌ not substituted — written literally as the filename "{pdb_in}"
PythonCodeStringRuntime(code="open('{pdb_in}')")

# ✅
PythonCodeStringRuntime(code="open('$pdb_in')")
```

See [Runtime System](./runtime.md) for how runtimes prepare their payloads.
