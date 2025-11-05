# MCP-Tools Implementation Plan (Simplified)

## Executive Summary

**Approach: SIMPLE & OBSERVABLE**

Build a straightforward MCP proxy that indexes and routes to other MCPs. No over-engineering—just solve the core problem of tool discovery and routing with excellent observability.

## Core Concept

A simple MCP server that:
1. Reads your existing registry JSON
2. Exposes 3-5 search/execute tools to the LLM
3. Routes requests to actual MCPs
4. Logs everything for observability

## Technical Architecture

### Simple Design

```
┌─────────────┐
│     LLM     │
└──────┬──────┘
       │ 3-5 tools only
┌──────▼──────────────────┐
│     MCP-Tools Server    │
│  ┌──────────────────┐   │
│  │  JSON Registry   │   │
│  ├──────────────────┤   │
│  │  Simple Router   │   │
│  ├──────────────────┤   │
│  │  OpenTelemetry   │   │
│  └──────────────────┘   │
└───────────┬─────────────┘
            │ Proxy calls
    ┌───────┴────────────────┐
    │                        │
┌───▼───┐  ┌────▼────┐  ┌───▼───┐
│MCP #1 │  │ MCP #2  │  │MCP #N │
└───────┘  └─────────┘  └───────┘
```

### Core Components (Keep It Simple)

#### 1. Registry Reader
- Read existing `global-registry.json`
- Build simple in-memory index
- Refresh every 5 minutes

#### 2. Simple Search
- Basic keyword matching (no AI/embeddings initially)
- Match against: name, category, description
- Return ranked results

#### 3. MCP Proxy
- Spawn MCP process when needed
- Forward requests/responses
- Handle timeouts gracefully

#### 4. Observability (Don't Reinvent)
- **OpenTelemetry**: Industry standard for traces/metrics
- **Structured Logging**: JSON logs with correlation IDs
- **Prometheus Metrics**: Response times, error rates
- Optional: Grafana dashboards

## Implementation Phases (2 Weeks Total)

### Week 1: Core Functionality
- [ ] Basic MCP server with TypeScript
- [ ] Read and index `global-registry.json`
- [ ] Implement 3 tools: `search_tools`, `execute_tool`, `list_categories`
- [ ] Simple subprocess spawning for MCP execution
- [ ] Structured JSON logging

### Week 2: Observability & Polish
- [ ] Add OpenTelemetry instrumentation
- [ ] Prometheus metrics endpoint
- [ ] Correlation IDs for request tracking
- [ ] Error handling and retries
- [ ] Basic health check endpoint

## Exposed Interface to LLMs

### Just 3 Core Tools
```typescript
// 1. Search for tools
search_tools({
  query: string,           // "email" or "database" or "pdf editor"
  category?: string        // optional: "productivity", "media", etc.
}) => Tool[]

// 2. Execute a tool
execute_tool({
  server: string,          // "gmail-mcp"
  tool: string,            // "send_email"
  params: any              // tool-specific parameters
}) => any

// 3. List available categories
list_categories() => string[]
```

## Observability Stack (Use What Works)

### OpenTelemetry Setup
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

// Automatic instrumentation for:
// - HTTP requests
// - Process spawning
// - Database queries (if needed)
```

### Key Metrics to Track
- `mcp_tools_search_duration_ms` - Search latency
- `mcp_tools_execute_duration_ms` - Execution time per MCP
- `mcp_tools_errors_total` - Error count by type
- `mcp_tools_active_connections` - Active MCP processes
- `mcp_tools_registry_size` - Number of indexed tools

### Structured Logging
```json
{
  "timestamp": "2025-09-28T10:00:00Z",
  "level": "info",
  "correlation_id": "abc-123",
  "event": "tool_execution",
  "mcp_server": "gmail-mcp",
  "tool": "send_email",
  "duration_ms": 145,
  "status": "success"
}
```

## Simple Performance Goals

- Search response: < 100ms
- MCP spawn time: < 500ms
- Memory usage: < 256MB
- Support 50+ concurrent requests

## MVP Scope (1 Week Sprint)

### What We Build
- Read `global-registry.json`
- Expose 3 tools to LLM
- Spawn MCPs as subprocesses
- Log everything with correlation IDs
- Prometheus metrics endpoint

### What We Don't Build (Yet)
- No caching (keep it simple)
- No fancy search (just substring matching)
- No connection pooling (spawn on demand)
- Single process only

## Code Structure (Simple)

```
mcp-tools/
├── src/
│   ├── index.ts           # MCP server entry
│   ├── registry.ts        # Read JSON registry
│   ├── search.ts          # Simple keyword search
│   ├── executor.ts        # Spawn and communicate with MCPs
│   ├── telemetry.ts       # OpenTelemetry setup
│   └── tools.ts           # The 3 tool implementations
├── package.json
└── tsconfig.json
```

## Dependencies (Minimal)

```json
{
  "@modelcontextprotocol/sdk": "latest",
  "@opentelemetry/api": "^1.7.0",
  "@opentelemetry/sdk-node": "^0.45.0",
  "@opentelemetry/exporter-prometheus": "^0.45.0",
  "pino": "^8.0.0"  // Fast JSON logger
}
```

## Next Steps

1. Create TypeScript project
2. Copy existing registry reader logic
3. Implement 3 tools
4. Add OpenTelemetry
5. Test with existing MCPs
6. Deploy and monitor

## Why This Works

- **Simple**: 500-1000 lines of code max
- **Observable**: You'll know exactly what's happening
- **Extensible**: Easy to add features later
- **Production-ready**: OpenTelemetry + Prometheus = industry standard

## Scalability Analysis: 1000+ Tools

### Yes, it scales because:

1. **In-memory index is fast**: 1000 tools × 1KB metadata = ~1MB RAM
2. **Substring search is O(n)**: 1000 tools × 10ms = 10ms total search time
3. **No persistent connections**: MCPs spawn on-demand, die after use
4. **Stateless design**: Can run multiple instances behind load balancer

### Potential Bottlenecks & Simple Fixes:

| Scale | Bottleneck | Simple Fix | Complexity |
|-------|------------|------------|------------|
| 100 tools | None | Current design works | ✅ Simple |
| 500 tools | Search speed | Add category filtering first | ✅ Simple |
| 1000 tools | Memory (if keeping MCPs alive) | Kill MCPs after 30s idle | ✅ Simple |
| 5000 tools | Search relevance | Add fuzzy matching (fuse.js) | ✅ Simple |
| 10000 tools | Index size | Split by category, lazy load | ⚠️ Medium |

### Real Numbers:
- **Memory**: ~1MB for 1000-tool index
- **Search**: ~10-50ms for 1000 tools (substring)
- **Process spawn**: ~200-500ms (one-time cost)
- **Concurrent MCPs**: OS limit (~1000 processes)

### When to Optimize:
1. **Start with simple design** (current plan)
2. **Monitor with OpenTelemetry**
3. **If search > 100ms**: Add indexing
4. **If memory > 500MB**: Add cleanup
5. **If spawn > 1s**: Add connection pooling

**Bottom Line**: The simple design handles 1000+ tools fine. At 10,000+ tools, you'd add basic optimizations (still simple). The observability tells you exactly when/what to optimize.