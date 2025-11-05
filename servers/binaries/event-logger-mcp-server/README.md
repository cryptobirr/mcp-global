# Event Logger MCP Server

A Model Context Protocol (MCP) server for logging events to a PostgreSQL database. This server provides tools to log events and query event history, making it useful for tracking activities like journal creation, file scans, task completions, and more.

## Features

- Log events with detailed information
- Query events with various filters
- Simple, flexible schema for storing event data
- PostgreSQL backend for reliable storage and efficient querying

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Build the server:
   ```
   npm run build
   ```
4. Configure your PostgreSQL connection in the MCP settings file

## Configuration

Add the following to your MCP settings file (typically located at `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` for VSCode):

```json
{
  "mcpServers": {
    "event-logger": {
      "command": "node",
      "args": ["/path/to/event-logger-mcp-server/build/index.js"],
      "env": {
        "DB_USER": "postgres",
        "DB_HOST": "localhost",
        "DB_NAME": "birrbot_live",
        "DB_PASSWORD": "Dayton01",
        "DB_PORT": "5432"
      },
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

Replace the environment variables with your PostgreSQL connection details if needed.

## Database Schema

The server creates a table called `events` with the following schema:

```sql
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    event_name VARCHAR(255) NOT NULL,
    source VARCHAR(255) NOT NULL,
    resource_path VARCHAR(255),
    details JSONB
);
```

## Available Tools

### log_event

Logs a new event to the database.

**Parameters:**
- `event_name` (required): Name of the event (e.g., 'journal_creation', 'file_scan')
- `source` (required): Source of the event (e.g., 'journal_system', 'task_manager')
- `resource_path` (optional): Path to the resource being acted upon
- `details` (optional): JSON object with additional details about the event

**Example:**
```
<use_mcp_tool>
<server_name>event-logger</server_name>
<tool_name>log_event</tool_name>
<arguments>
{
  "event_name": "journal_creation",
  "source": "journal_system",
  "resource_path": "journal/daily/2025-05-03.md",
  "details": {
    "template_version": "v3",
    "validation_status": "passed"
  }
}
</arguments>
</use_mcp_tool>
```

### query_events

Queries events from the database with various filters.

**Parameters:**
- `event_name` (optional): Filter by event name
- `source` (optional): Filter by source
- `resource_path` (optional): Filter by resource path
- `start_date` (optional): Filter by start date (ISO format)
- `end_date` (optional): Filter by end date (ISO format)
- `limit` (optional, default: 100): Maximum number of events to return
- `offset` (optional, default: 0): Offset for pagination

**Example:**
```
<use_mcp_tool>
<server_name>event-logger</server_name>
<tool_name>query_events</tool_name>
<arguments>
{
  "event_name": "journal_creation",
  "source": "journal_system",
  "start_date": "2025-05-01T00:00:00Z",
  "end_date": "2025-05-03T23:59:59Z",
  "limit": 10
}
</arguments>
</use_mcp_tool>
```

## Use Cases

### Journal Creation Logging

Replace text file logging with database logging for journal creation activities:

```
<use_mcp_tool>
<server_name>event-logger</server_name>
<tool_name>log_event</tool_name>
<arguments>
{
  "event_name": "journal_creation",
  "source": "journal_system",
  "resource_path": "journal/daily/2025-05-03.md",
  "details": {
    "template_version": "v3",
    "validation_status": "passed"
  }
}
</arguments>
</use_mcp_tool>
```

### Resource Scan Logging

Log when resources are scanned during journal creation:

```
<use_mcp_tool>
<server_name>event-logger</server_name>
<tool_name>log_event</tool_name>
<arguments>
{
  "event_name": "resource_scan",
  "source": "journal_system",
  "resource_path": "gtd/routines.md",
  "details": {
    "scan_purpose": "daily and weekend routines",
    "found_items": 3
  }
}
</arguments>
</use_mcp_tool>
```

### Task Completion Logging

Log when tasks are completed:

```
<use_mcp_tool>
<server_name>event-logger</server_name>
<tool_name>log_event</tool_name>
<arguments>
{
  "event_name": "task_completion",
  "source": "task_manager",
  "resource_path": "gtd/next-actions.md",
  "details": {
    "task_id": "123",
    "task_name": "Complete Weekly GTD Review",
    "completion_time": "2025-05-03T10:30:00Z"
  }
}
</arguments>
</use_mcp_tool>
```

## License

MIT