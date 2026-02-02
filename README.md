# horus-docs

The Horus documentation is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Overview

horus-runtime

- Generates API docs via pdoc
- CI publishes artifacts
  - beta (from main)
  - vX.Y.Z (from tags)
    horus-docs
- CI downloads latest artifacts
- Places them in docs/runtime-api/
- Docusaurus versions them automatically
  Local dev
- Symlink horus-docs/docs/runtime-api/beta
- Regenerate docs locally with one command

## Contributing

### Install docusaurus dependencies

```bash
npm i
```

### Local Development

For local development to work properly, you'll need to clone the horus-runtime repository too if you want to modify docs from the docstrings into here.

```bash
npm run link-runtime <path_to_runtime>
```

This will link the folder horus-runtime/docs/ to docs/horus-runtime. This way, you can automatically build docs with pdocs and visualize them here.
To start the development server

```bash
npm run start
```

## Build

First build the docs in horus-runtime with

```
pdoc
```

```bash
yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

Using SSH:

```bash
USE_SSH=true yarn deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.
