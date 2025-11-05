import { Registry } from '../../src/registry';
import { MCPServer, RegistryParseError, FileNotFoundError } from '../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Registry', () => {
  const testRegistryPath = './test-registry.json';
  let registry: Registry;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (registry) {
      registry.destroy();
    }
  });

  describe('load', () => {
    it('should load valid registry JSON', async () => {
      // Arrange
      const mockRegistry = {
        servers: {
          'test-mcp': {
            name: 'test-mcp',
            category: 'test',
            description: 'Test MCP',
            path: '/path/to/mcp'
          }
        }
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));

      // Act
      registry = new Registry(testRegistryPath);
      const servers = await registry.load();

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('test-mcp');
      expect(servers[0].category).toBe('test');
      expect(servers[0].path).toBe('/path/to/mcp');
      expect(mockFs.readFile).toHaveBeenCalledWith(testRegistryPath, 'utf8');
    });

    it('should return empty array for registry with no servers', async () => {
      // Arrange
      const mockRegistry = { servers: {} };
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));

      // Act
      registry = new Registry(testRegistryPath);
      const servers = await registry.load();

      // Assert
      expect(servers).toHaveLength(0);
    });

    it('should throw RegistryParseError for malformed JSON', async () => {
      // Arrange
      mockFs.readFile.mockResolvedValue('invalid json {');

      // Act & Assert
      registry = new Registry(testRegistryPath);
      await expect(registry.load()).rejects.toThrow(RegistryParseError);
    });

    it('should throw FileNotFoundError when registry file does not exist', async () => {
      // Arrange
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      // Act & Assert
      registry = new Registry(testRegistryPath);
      await expect(registry.load()).rejects.toThrow(FileNotFoundError);
    });

    it('should load large registry with 1000+ MCPs in under 100ms', async () => {
      // Arrange
      const servers: Record<string, MCPServer> = {};
      for (let i = 0; i < 1000; i++) {
        servers[`mcp-${i}`] = {
          name: `mcp-${i}`,
          category: 'test',
          description: `Test MCP ${i}`,
          path: `/path/to/mcp-${i}`
        };
      }
      const mockRegistry = { servers };
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));

      // Act
      registry = new Registry(testRegistryPath);
      const start = Date.now();
      const result = await registry.load();
      const duration = Date.now() - start;

      // Assert
      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('refresh', () => {
    it('should automatically reload registry after 5 minutes', async () => {
      // Arrange
      const mockRegistry = {
        servers: {
          'test-mcp': {
            name: 'test-mcp',
            category: 'test',
            description: 'Test MCP',
            path: '/path/to/mcp'
          }
        }
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockRegistry));
      jest.useFakeTimers();

      // Act
      registry = new Registry(testRegistryPath, 300000); // 5 minutes
      await registry.load();

      // Fast-forward 5 minutes
      jest.advanceTimersByTime(300000);

      // Assert
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });
});