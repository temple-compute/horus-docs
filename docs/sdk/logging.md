---
id: logger
title: Logging
sidebar_label: Logging
---

# Horus Runtime Logging

`horus-runtime` uses [**Loguru**](https://loguru.readthedocs.io/en/stable/) for logging. A global logger is configured automatically and can be used throughout the project.

## Usage

Import the shared logger:

```python
from horus_runtime.logger import horus_logger

horus_logger.info("Starting runtime")
horus_logger.debug("Executor initialized")
horus_logger.error("Task failed")
```

## Configuration

Logging behavior is configured via environment variables using the prefix:

```
HORUS_LOGGER_
```

Example configuration:

```bash
HORUS_LOGGER_LEVEL=DEBUG
HORUS_LOGGER_LOG_DIRECTORY=logs
HORUS_LOGGER_ROTATION="10 MB"
HORUS_LOGGER_RETENTION="7 days"
```

### Available Settings

| Setting             | Default                     | Description                        |
| ------------------- | --------------------------- | ---------------------------------- |
| `LEVEL`             | `INFO`                      | Minimum log level                  |
| `LOG_DIRECTORY`     | `logs`                      | Directory where logs are written   |
| `ROTATION`          | `10 MB`                     | Max file size before rotating logs |
| `RETENTION`         | `7 days`                    | How long to keep log files         |
| `COMPRESSION`       | `None`                      | Compression format for old logs    |
| `FILENAME_TEMPLATE` | `log_{time:YYYY-MM-DD}.log` | Template for log file names        |

## Features

- Logs to both **console** and **file**
- Automatic **log rotation**
- Configurable **retention** and **compression**
- Environment-based configuration via **Pydantic Settings**
- Structured logs with timestamps, level, function, and line number

## Log Files

By default, logs are written to:

```
logs/log_YYYY-MM-DD.log
```

The directory is created automatically if it does not exist.

## Why Not `print()`?

`print()` should **never be used** in `horus-runtime`. Always use the configured logger so logs remain structured, persistent, and configurable.

Example of proper logging:

```python
horus_logger.info("Task completed successfully")
horus_logger.warning("Missing optional field, using default")
horus_logger.error("Task failed due to exception", exc_info=True)
```
