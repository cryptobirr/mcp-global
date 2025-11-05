# MCP Reference Server - Design Plan

> **Purpose**: Create a reference MCP server that provides knowledge and guidance for MCP management
> **Philosophy**: Information and guidance, not automation - teach users how to do things
> **Status**: Planning Phase (Revised)

## 🎯 Vision Correction

An MCP server that serves as a **living knowledge base** for MCP ecosystem management. Instead of automating tasks, it provides comprehensive information, step-by-step guides, and reference materials that users can access through natural language from any LLM tool.

### Core Concept
- **Knowledge repository** - Comprehensive information about MCP setup and management
- **Interactive guidance** - Step-by-step instructions on demand
- **Reference material** - Configurations, examples, troubleshooting
- **Teaching tool** - Helps users understand and learn MCP concepts

---

## 🏗️ Architecture Overview

### High-Level Design
```
┌─────────────────────────────────────────────────┐
│                LLM Tools                        │
│  Claude Code │ Claude Desktop │ Cursor │ ...    │
└─────────────┬───────────────────────────────────┘
              │ MCP Protocol
┌─────────────▼───────────────────────────────────┐
│          MCP Reference Server                   │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐│
│  │ Knowledge   │ │ Instruction │ │  Reference   ││
│  │   Base      │ │   Engine    │ │   Library    ││
│  └─────────────┘ └─────────────┘ └──────────────┘│
└─────────────┬───────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────┐
│        Static Knowledge Repository              │
│  guides/ examples/ references/ troubleshooting/ │
└─────────────────────────────────────────────────┘
```

### Core Components

#### 1. **Knowledge Base**
- Installation guides for different server types
- Configuration templates and examples
- Tool-specific setup instructions
- Best practices and patterns

#### 2. **Instruction Engine**
- Step-by-step procedure generation
- Context-aware guidance
- Prerequisite checking
- Validation steps

#### 3. **Reference Library**
- Server catalog with capabilities
- Configuration format references
- Command examples
- Troubleshooting guides

---

## 🛠️ MCP Tools (Information Functions)

### Server Information Tools

#### `get_server_info`
**Purpose**: Get detailed information about an MCP server
**Parameters**:
- `server_name`: Name of the server
- `include_examples`: Whether to include configuration examples
**Returns**: Server details, capabilities, requirements, examples

#### `list_available_servers`
**Purpose**: List all known MCP servers with summaries
**Parameters**:
- `category` (optional): Filter by category
- `requirements` (optional): Filter by requirements (node, python, etc.)
**Returns**: Server catalog with descriptions

#### `search_servers`
**Purpose**: Search servers by capability or description
**Parameters**:
- `query`: Search terms
- `capability_type`: tools, resources, prompts
**Returns**: Matching servers with relevance

### Configuration Guidance Tools

#### `get_tool_setup_guide`
**Purpose**: Get setup instructions for specific LLM tool
**Parameters**:
- `tool`: claude-code, claude-desktop, cursor, etc.
- `servers`: List of servers to configure
**Returns**: Step-by-step setup instructions

#### `generate_config_example`
**Purpose**: Generate example configuration
**Parameters**:
- `tool`: Target tool
- `servers`: Servers to include
- `with_comments`: Include explanatory comments
**Returns**: Example configuration with explanations

#### `validate_config_format`
**Purpose**: Explain how to validate configuration
**Parameters**:
- `tool`: Tool type
- `config_content`: Configuration to check
**Returns**: Validation instructions and common issues

### Troubleshooting Tools

#### `diagnose_issue`
**Purpose**: Get troubleshooting steps for common issues
**Parameters**:
- `issue_description`: Description of the problem
- `tool`: Which tool is having issues
**Returns**: Diagnostic steps and solutions

#### `get_common_errors`
**Purpose**: List common errors and solutions
**Parameters**:
- `tool` (optional): Specific tool
- `error_type` (optional): connection, configuration, etc.
**Returns**: Error patterns and solutions

#### `check_prerequisites`
**Purpose**: Get prerequisite checking instructions
**Parameters**:
- `servers`: Servers to check
- `system`: System type (mac, windows, linux)
**Returns**: Prerequisite checklist and verification steps

### Learning & Reference Tools

#### `explain_mcp_concept`
**Purpose**: Explain MCP concepts and terminology
**Parameters**:
- `concept`: servers, tools, resources, prompts, etc.
- `detail_level`: basic, intermediate, advanced
**Returns**: Explanations with examples

#### `get_best_practices`
**Purpose**: Get best practices for MCP management
**Parameters**:
- `area`: configuration, security, performance, etc.
**Returns**: Best practice guidelines

#### `show_examples`
**Purpose**: Show real-world examples
**Parameters**:
- `example_type`: configurations, workflows, setups
- `tool`: Specific tool context
**Returns**: Practical examples with explanations

---

## 📚 Knowledge Repository Structure

### Directory Layout
```
~/.mcp-global/knowledge/
├── servers/                    # Server information
│   ├── todoist/
│   │   ├── info.yaml          # Server metadata
│   │   ├── setup.md           # Setup instructions
│   │   ├── examples/          # Configuration examples
│   │   └── troubleshooting.md # Common issues
│   └── youtube/
│       ├── info.yaml
│       ├── setup.md
│       └── examples/
├── tools/                     # LLM tool guides
│   ├── claude-code/
│   │   ├── setup-guide.md     # Complete setup guide
│   │   ├── cli-commands.md    # CLI reference
│   │   ├── examples/          # Example configurations
│   │   └── troubleshooting.md # Tool-specific issues
│   ├── claude-desktop/
│   └── cursor/
├── guides/                    # General guides
│   ├── getting-started.md
│   ├── server-installation.md
│   ├── configuration-basics.md
│   └── security-best-practices.md
├── references/                # Reference materials
│   ├── config-formats/        # Configuration format specs
│   ├── command-examples/      # Command references
│   └── api-documentation/     # MCP protocol info
└── troubleshooting/           # Problem-solving
    ├── common-errors.yaml    # Error database
    ├── diagnostic-steps.md   # General diagnostics
    └── recovery-procedures.md # Recovery guides
```

### Data Models

#### Server Information Model
```yaml
# servers/todoist/info.yaml
name: "todoist-mcp-server"
display_name: "Todoist MCP Server"
description: "Manage Todoist tasks through MCP"
category: "productivity"
type: "nodejs"

capabilities:
  tools:
    - name: "create_task"
      description: "Create a new task"
    - name: "list_tasks"
      description: "List existing tasks"

requirements:
  environment:
    - name: "TODOIST_API_TOKEN"
      description: "Your Todoist API token"
      required: true
  system:
    - "Node.js >= 16"
    - "npm or yarn"

installation:
  source: "git"
  url: "https://github.com/example/todoist-mcp-server"
  build_steps:
    - "npm install"
    - "npm run build"

examples:
  claude_desktop: |
    {
      "mcpServers": {
        "todoist": {
          "command": "node",
          "args": ["/path/to/server/dist/index.js"],
          "env": {
            "TODOIST_API_TOKEN": "your_token_here"
          }
        }
      }
    }

  claude_code: |
    claude mcp add todoist node /path/to/server/dist/index.js -e TODOIST_API_TOKEN=your_token
```

#### Tool Setup Guide Model
```markdown
# tools/claude-code/setup-guide.md

# Claude Code MCP Setup Guide

## Overview
Claude Code uses CLI commands to manage MCP servers, not manual JSON editing.

## Prerequisites
- Claude Code installed and updated
- MCP servers available locally

## Step-by-Step Setup

### 1. Add a Server
```bash
claude mcp add <name> <command> [args...] -e ENV_VAR=value
```

### 2. Verify Installation
```bash
claude mcp list
```

### 3. Test in Claude Code
Use `/mcp` command to see available servers.

## Examples
[Include specific examples from our proven setups]

## Troubleshooting
[Include common issues and solutions]
```

---

## 🔧 Implementation Strategy

### Phase 1: Core Knowledge Base
1. **Server Information**: Document all available servers
2. **Tool Guides**: Create comprehensive guides for proven tools
3. **Basic MCP Tools**: Implement information retrieval functions
4. **Example Repository**: Collect working configurations

### Phase 2: Interactive Guidance
1. **Step Generator**: Dynamic instruction generation
2. **Context Awareness**: Tool-specific guidance
3. **Troubleshooting Engine**: Interactive problem solving
4. **Validation Helpers**: Configuration checking guides

### Phase 3: Advanced Features
1. **Search and Discovery**: Advanced server search
2. **Learning Paths**: Structured learning guides
3. **Best Practices**: Curated recommendations
4. **Community Examples**: User-contributed examples

## 🎯 Usage Examples

### Information Retrieval
```
User: "Tell me about the Todoist MCP server"
Response: [Server info, capabilities, setup requirements, examples]

User: "How do I add servers to Claude Code?"
Response: [Step-by-step CLI instructions with examples]

User: "Show me a Claude Desktop configuration with YouTube and Todoist"
Response: [Complete JSON example with explanations]
```

### Troubleshooting
```
User: "Claude Desktop can't connect to my MCP server"
Response: [Diagnostic checklist, common causes, step-by-step fixes]

User: "What does 'Could not attach to MCP server' mean?"
Response: [Error explanation, possible causes, troubleshooting steps]
```

### Learning
```
User: "What's the difference between Claude Code and Claude Desktop MCP setup?"
Response: [Comparison table, different approaches, when to use each]

User: "What are MCP tools vs resources vs prompts?"
Response: [Concept explanation with examples]
```

## ✅ Benefits of This Approach

### For Users
- **Learn by doing** - Users understand what they're configuring
- **Always available** - Knowledge accessible from any LLM tool
- **Up-to-date** - Information reflects actual working setups
- **Contextual** - Get exactly the information needed

### For Maintenance
- **Simple to update** - Markdown and YAML files
- **Version controlled** - Track changes to knowledge
- **Collaborative** - Others can contribute knowledge
- **No automation complexity** - Just information, no state management

### For Extensibility
- **Easy to add new tools** - Just add new guide files
- **Easy to add servers** - Just add server information
- **Community contributions** - Others can add their server knowledge
- **Scalable knowledge** - Information grows with ecosystem

---

## 🚀 Implementation Plan

### Immediate Next Steps
1. **Create knowledge repository structure**
2. **Document proven working setups** (Claude Code, Claude Desktop)
3. **Implement basic information retrieval MCP tools**
4. **Test reference server with Claude Code**

### Content Development
1. **Server catalog** - Document all 15+ available servers
2. **Tool guides** - Complete guides for each LLM tool
3. **Example library** - Working configurations and commands
4. **Troubleshooting database** - Common issues and solutions

This approach is much cleaner - a **pure information system** that teaches and guides rather than automates. Users learn the underlying concepts while getting practical help exactly when they need it.

**Ready to implement this reference-based approach?**