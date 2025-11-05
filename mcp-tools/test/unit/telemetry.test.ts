import { Telemetry } from '../../src/telemetry';
import { metrics, trace } from '@opentelemetry/api';

jest.mock('@traceloop/node-server-sdk');
jest.mock('@opentelemetry/api');

const mockMetrics = metrics as jest.Mocked<typeof metrics>;
const mockTrace = trace as jest.Mocked<typeof trace>;

describe('Telemetry', () => {
  let telemetry: Telemetry;
  let mockMeter: any;
  let mockHistogram: any;
  let mockCounter: any;
  let mockTracer: any;
  let mockSpan: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock histogram
    mockHistogram = {
      record: jest.fn()
    };

    // Setup mock counter
    mockCounter = {
      add: jest.fn()
    };

    // Setup mock meter
    mockMeter = {
      createHistogram: jest.fn().mockReturnValue(mockHistogram),
      createCounter: jest.fn().mockReturnValue(mockCounter)
    };

    // Setup mock span
    mockSpan = {
      setAttributes: jest.fn(),
      end: jest.fn()
    };

    // Setup mock tracer
    mockTracer = {
      startActiveSpan: jest.fn()
    };

    // Setup API mocks
    mockMetrics.getMeter.mockReturnValue(mockMeter);
    mockTrace.getTracer.mockReturnValue(mockTracer);

    telemetry = new Telemetry();
  });

  describe('initialization', () => {
    it('should initialize OpenTelemetry with correct configuration', () => {
      // Assert
      expect(mockMetrics.getMeter).toHaveBeenCalledWith('mcp-tools');
      expect(mockMeter.createHistogram).toHaveBeenCalledWith('mcp_tools_search_duration_ms', {
        description: 'Duration of search operations in milliseconds'
      });
      expect(mockMeter.createHistogram).toHaveBeenCalledWith('mcp_tools_execute_duration_ms', {
        description: 'Duration of tool execution in milliseconds'
      });
      expect(mockMeter.createCounter).toHaveBeenCalledWith('mcp_tools_errors_total', {
        description: 'Total number of errors'
      });
    });
  });

  describe('recordSearchDuration', () => {
    it('should record search duration metric', async () => {
      // Arrange
      const mockFunction = jest.fn().mockResolvedValue(['result1', 'result2']);

      // Act
      const result = await telemetry.recordSearchDuration(mockFunction);

      // Assert
      expect(result).toEqual(['result1', 'result2']);
      expect(mockFunction).toHaveBeenCalled();
      expect(mockHistogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        { operation: 'search' }
      );
    });

    it('should record duration even when function throws', async () => {
      // Arrange
      const mockFunction = jest.fn().mockRejectedValue(new Error('Search failed'));

      // Act & Assert
      await expect(telemetry.recordSearchDuration(mockFunction)).rejects.toThrow('Search failed');
      expect(mockHistogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        { operation: 'search' }
      );
    });

    it('should record accurate duration', async () => {
      // Arrange
      const mockFunction = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'result';
      });

      // Act
      await telemetry.recordSearchDuration(mockFunction);

      // Assert
      const recordedDuration = mockHistogram.record.mock.calls[0][0];
      expect(recordedDuration).toBeGreaterThanOrEqual(45);
      expect(recordedDuration).toBeLessThan(100);
    });
  });

  describe('recordMCPExecution', () => {
    it('should create span with correct attributes', async () => {
      // Arrange
      const mockFunction = jest.fn().mockResolvedValue({ result: 'success' });
      mockTracer.startActiveSpan.mockImplementation((name: any, options: any, callback: any) => {
        return callback(mockSpan);
      });

      // Act
      const result = await telemetry.recordMCPExecution('gmail-mcp', 'send_email', mockFunction);

      // Assert
      expect(result).toEqual({ result: 'success' });
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('mcp.tool.execute', {
        attributes: {
          'gen_ai.tool.name': 'send_email',
          'gen_ai.system': 'gmail-mcp',
          'gen_ai.operation.name': 'tool_call'
        }
      }, expect.any(Function));

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'gen_ai.response.finish_reason': 'stop'
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record execution duration', async () => {
      // Arrange
      const mockFunction = jest.fn().mockResolvedValue({ result: 'success' });
      mockTracer.startActiveSpan.mockImplementation((name: any, options: any, callback: any) => {
        return callback(mockSpan);
      });

      // Act
      await telemetry.recordMCPExecution('test-mcp', 'test_tool', mockFunction);

      // Assert
      expect(mockHistogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        { operation: 'execute', server: 'test-mcp', tool: 'test_tool' }
      );
    });

    it('should handle function errors and record error attributes', async () => {
      // Arrange
      const mockFunction = jest.fn().mockRejectedValue(new Error('Execution failed'));
      mockTracer.startActiveSpan.mockImplementation((name: any, options: any, callback: any) => {
        return callback(mockSpan);
      });

      // Act & Assert
      await expect(telemetry.recordMCPExecution('test-mcp', 'test_tool', mockFunction))
        .rejects.toThrow('Execution failed');

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'gen_ai.response.finish_reason': 'error'
      });
      expect(mockSpan.end).toHaveBeenCalled();
      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'execution_error',
        server: 'test-mcp',
        tool: 'test_tool'
      });
    });

    it('should follow OpenLLMetry semantic conventions', async () => {
      // Arrange
      const mockFunction = jest.fn().mockResolvedValue({ result: 'success' });
      mockTracer.startActiveSpan.mockImplementation((name: any, options: any, callback: any) => {
        return callback(mockSpan);
      });

      // Act
      await telemetry.recordMCPExecution('gmail-mcp', 'send_email', mockFunction);

      // Assert
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('mcp.tool.execute', {
        attributes: {
          'gen_ai.tool.name': 'send_email',
          'gen_ai.system': 'gmail-mcp',
          'gen_ai.operation.name': 'tool_call'
        }
      }, expect.any(Function));

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'gen_ai.response.finish_reason': 'stop'
      });
    });
  });

  describe('recordError', () => {
    it('should increment error counter with proper attributes', () => {
      // Act
      telemetry.recordError('validation_error', 'Invalid parameters', {
        operation: 'search',
        query: 'test'
      });

      // Assert
      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'validation_error',
        operation: 'search',
        query: 'test'
      });
    });

    it('should handle errors without additional attributes', () => {
      // Act
      telemetry.recordError('network_error', 'Connection failed');

      // Assert
      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'network_error'
      });
    });
  });

  describe('getMetricsRegistry', () => {
    it('should return metrics for Prometheus export', () => {
      // Act
      const metrics = telemetry.getMetricsRegistry();

      // Assert
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
    });
  });

  describe('correlation ID', () => {
    it('should generate and track correlation IDs', () => {
      // Act
      const correlationId1 = telemetry.generateCorrelationId();
      const correlationId2 = telemetry.generateCorrelationId();

      // Assert
      expect(correlationId1).toBeDefined();
      expect(correlationId2).toBeDefined();
      expect(correlationId1).not.toBe(correlationId2);
      expect(typeof correlationId1).toBe('string');
      expect(correlationId1.length).toBeGreaterThan(0);
    });

    it('should set and get current correlation ID', () => {
      // Arrange
      const testId = 'test-correlation-id';

      // Act
      telemetry.setCorrelationId(testId);
      const retrievedId = telemetry.getCurrentCorrelationId();

      // Assert
      expect(retrievedId).toBe(testId);
    });
  });

  describe('destroy', () => {
    it('should cleanup resources properly', () => {
      // Act
      telemetry.destroy();

      // Assert - should not throw errors
      expect(() => telemetry.destroy()).not.toThrow();
    });
  });
});