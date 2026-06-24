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
All string-templating runtimes (`command`, `python_script`, `python`) now share
a single syntax: **`string.Template`** `$`/`${}`. Using the wrong syntax leaves
the placeholder untouched.

## At a glance

| Runtime (`kind`)        | Syntax                                  | Resolves to                              | Notes |
| ----------------------- | --------------------------------------- | ---------------------------------------- | ----- |
| `command`               | `$id`, `${id}`, `${id.path}`, `${task.*}` | on-target path of the artifact `id`    | `string.Template`; `{}` passes through untouched |
| `python_script`         | `$id`, `${id}` — **in `args` only**     | on-target path                           | the `.py` file is shipped as-is, not templated |
| `python` (code string)  | `$id`, `${id}`, `${id.path}`, `${task.*}` | on-target path (a string)              | `string.Template`; **`{}` is left untouched** |
| `python_function`       | parameter named `id`                    | the `BaseArtifact` object (use `.path`)  | injected as a kwarg, not string templating |

:::warning Ids must be valid identifiers everywhere
`string.Template` only matches `[a-z_][a-z0-9_]*` (with optional dotted
suffix), so a hyphen or space breaks substitution — `$pdb-in` resolves `$pdb`
then the literal `-in`, and `${pdb-in}` does not match at all. Use
`snake_case` ids (`pdb_in`, not `pdb-in`).
:::

:::info `$$` emits a literal `$`
Double the dollar sign to produce a literal `$` in the output: `$$PATH`
becomes `$PATH`.
:::

:::note Shell `$VAR` is preserved
Shell environment variables like `$HOME` or `$PATH` are left untouched
**unless** an artifact has the same id. If you have an artifact `id: HOME`,
`$HOME` will be replaced by the artifact path, not the shell variable.
:::

:::note `{}` passes through untouched
Curly braces — shell brace expansion, Python f-strings, dict literals,
comprehensions — are no longer touched by any string-templating runtime.
`{a,b}` stays `{a,b}`.
:::

## `command` — `$id` (and `${id.path}`, `${task.*}`)

The command string is rendered with `string.Template`. Each artifact id
becomes a placeholder: `$id` (or `${id}`) resolves to the on-target path.
Dotted forms access artifact attributes (`${id.path}`, `${id.id}`,
`${id.kind}`). The `task` namespace exposes task fields
(`${task.name}`, `${task.kind}`).

```python
from horus_builtin.runtime.command import CommandRuntime

CommandRuntime(
    command="python process.py --in $pdb_in --out $result --tag ${task.name}",
)
```

Given an input `pdb_in` and output `result`, this renders to e.g.
`python process.py --in /work/abc/pdb_in.txt --out /work/abc/result.json --tag step1`.

:::info Reserved id
`task` is reserved for the template namespace — an artifact with `id: task`
raises a `ValueError`. Pick another id.
:::

## `python_script` — `$id` in `args`

`python_script` ships a local `.py` file to the target and runs it. The **script
file is not templated** (it is your real source). Pass artifact paths through
`args`, which is rendered with the same `string.Template` syntax:

```python
from horus_builtin.runtime.python_script import PythonScriptRuntime

PythonScriptRuntime(
    script="scripts/process.py",
    args="--in $pdb_in --out $result",
)
```

Inside `process.py`, read the paths from `argv` (e.g. with `argparse`).

## `python` — `$id` / `${id}`

The `PythonCodeStringRuntime` runs an inline code string. It substitutes with
`string.Template`, so placeholders use `$id` (or `${id}` when a letter or digit
follows the name). Dotted forms like `${id.path}` and `${task.name}` are
supported. Python's own `{}` — dict/set literals, f-strings, comprehensions —
is left untouched. Unknown `$name` references are left as-is.

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
  every runtime.
- The id is the contract between the workflow definition and the body; a display
  name (if your tooling has one) is cosmetic and is **not** used for
  substitution.

## Common pitfall

A `command` or `python` task that still uses the old `{}` syntax:

```python
# ❌ not substituted — {} passes through unchanged
CommandRuntime(command="python process.py --in {pdb_in}")

# ✅
CommandRuntime(command="python process.py --in $pdb_in")

# ❌ not substituted in python code either
PythonCodeStringRuntime(code="open('{pdb_in}')")

# ✅
PythonCodeStringRuntime(code="open('$pdb_in')")
```

See [Runtime System](./runtime.md) for how runtimes prepare their payloads.
