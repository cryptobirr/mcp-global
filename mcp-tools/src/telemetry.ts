import { metrics, trace } from '@opentelemetry/api';
import { randomUUID } from 'crypto';

export class Telemetry {
  private searchDuration: any;
  private executeDuration: any;
  private errorCounter: any;
  private meter: any;
  private tracer: any;
  private correlationIdStore = new Map<string, string>();
  private currentCorrelationId?: string;

  constructor() {
    // Setup OpenTelemetry metrics
    this.meter = metrics.getMeter('mcp-tools');
    this.tracer = trace.getTracer('mcp-tools');

    // Create metrics
    this.searchDuration = this.meter.createHistogram('mcp_tools_search_duration_ms', {
      description: 'Duration of search operations in milliseconds'
    });

    this.executeDuration = this.meter.createHistogram('mcp_tools_execute_duration_ms', {
      description: 'Duration of tool execution in milliseconds'
    });

    this.errorCounter = this.meter.createCounter('mcp_tools_errors_total', {
      description: 'Total number of errors'
    });

  }

  async recordSearchDuration<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.searchDuration.record(duration, { operation: 'search' });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.searchDuration.record(duration, { operation: 'search' });
      throw error;
    }
  }

  async recordMCPExecution<T>(
    server: string,
    tool: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();

    return this.tracer.startActiveSpan('mcp.tool.execute', {
      attributes: {
        'gen_ai.tool.name': tool,
        'gen_ai.system': server,
        'gen_ai.operation.name': 'tool_call'
      }
    }, async (span: any) => {
      try {
        const result = await fn();
        const duration = Date.now() - start;

        // Record successful execution
        span.setAttributes({
          'gen_ai.response.finish_reason': 'stop'
        });

        this.executeDuration.record(duration, {
          operation: 'execute',
          server,
          tool
        });

        return result;
      } catch (error) {
        const duration = Date.now() - start;

        // Record error execution
        span.setAttributes({
          'gen_ai.response.finish_reason': 'error'
        });

        this.executeDuration.record(duration, {
          operation: 'execute',
          server,
          tool
        });

        this.errorCounter.add(1, {
          error_type: 'execution_error',
          server,
          tool
        });

        throw error;
      } finally {
        span.end();
      }
    });
  }

  recordError(
    errorType: string,
    message: string,
    attributes?: Record<string, string>
  ): void {
    const errorAttributes = {
      error_type: errorType,
      ...attributes
    };

    this.errorCounter.add(1, errorAttributes);
  }

  generateCorrelationId(): string {
    return randomUUID();
  }

  setCorrelationId(id: string): void {
    this.currentCorrelationId = id;
  }

  getCurrentCorrelationId(): string | undefined {
    return this.currentCorrelationId;
  }

  getMetricsRegistry(): any {
    return {
      searchDuration: this.searchDuration,
      executeDuration: this.executeDuration,
      errorCounter: this.errorCounter
    };
  }


  destroy(): void {
    // Cleanup resources
    this.correlationIdStore.clear();
    this.currentCorrelationId = undefined;
  }
}