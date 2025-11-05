import { Registry } from '../../src/registry';
import { Search } from '../../src/search';
import { Executor } from '../../src/executor';
import { Tools } from '../../src/tools';
import { Telemetry } from '../../src/telemetry';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('MCP-Tools Integration Tests', () => {
  let registry: Registry;
  let search: Search;
  let executor: Executor;
  let tools: Tools;
  let telemetry: Telemetry;
  let testRegistryPath: string;

  beforeEach(async () => {
    // Setup test registry file
    testRegistryPath = path.join(__dirname, '..', 'fixtures', 'test-registry.json');

    // Initialize components
    registry = new Registry(testRegistryPath);
    search = new Search();
    executor = new Executor();
    telemetry = new Telemetry();
    tools = new Tools(search, executor, registry);

    // Load and index registry
    const servers = await registry.load();
    search.index(servers);
  });

  afterEach(() => {
    registry.destroy();
    executor.destroy();
    telemetry.destroy();
  });

  describe('Full workflow integration', () => {
    it('should load registry, search, and prepare for execution', async () => {
      // Act
      const searchResults = await tools.searchTools({ query: 'gmail' });
      const categories = await tools.listCategories();
      const toolsList = await tools.getToolsList();

      // Assert
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toBe('gmail-mcp');
      expect(searchResults[0].category).toBe('productivity');

      expect(categories).toContain('productivity');
      expect(categories).toContain('database');
      expect(categories).toContain('api');

      expect(toolsList).toHaveLength(5);
      expect(toolsList.map(t => t.name)).toContain('search_tools');
      expect(toolsList.map(t => t.name)).toContain('execute_tool');
      expect(toolsList.map(t => t.name)).toContain('list_categories');
      expect(toolsList.map(t => t.name)).toContain('list_mcps');
      expect(toolsList.map(t => t.name)).toContain('get_mcp_details');
    });

    it('should handle search with category filtering', async () => {
      // Act
      const databaseTools = await tools.searchTools({
        query: '',
        category: 'database'
      });

      const productivityTools = await tools.searchTools({
        query: '',
        category: 'productivity'
      });

      // Assert
      expect(databaseTools).toHaveLength(1);
      expect(databaseTools[0].name).toBe('postgres-mcp');

      expect(productivityTools).toHaveLength(1);
      expect(productivityTools[0].name).toBe('gmail-mcp');
    });

    it('should handle complex search queries', async () => {
      // Act
      const emailResults = await tools.searchTools({ query: 'email' });
      const weatherResults = await tools.searchTools({ query: 'weather' });
      const postgresResults = await tools.searchTools({ query: 'PostgreSQL' });

      // Assert
      expect(emailResults).toHaveLength(1);
      expect(emailResults[0].name).toBe('gmail-mcp');

      expect(weatherResults).toHaveLength(1);
      expect(weatherResults[0].name).toBe('weather-mcp');

      expect(postgresResults).toHaveLength(1);
      expect(postgresResults[0].name).toBe('postgres-mcp');
    });

    it('should maintain data consistency across operations', async () => {
      // Act - Perform multiple operations
      const allTools1 = await tools.searchTools({ query: '' });
      const categories1 = await tools.listCategories();

      const searchResults = await tools.searchTools({ query: 'mcp' });

      const allTools2 = await tools.searchTools({ query: '' });
      const categories2 = await tools.listCategories();

      // Assert - Data should remain consistent
      expect(allTools1).toEqual(allTools2);
      expect(categories1).toEqual(categories2);
      expect(searchResults.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling integration', () => {
    it('should handle invalid search gracefully', async () => {
      // Act
      const results = await tools.searchTools({ query: 'nonexistent-tool' });

      // Assert
      expect(results).toEqual([]);
    });

    it('should handle invalid execution requests', async () => {
      // Act & Assert
      await expect(tools.executeTool({
        server: '',
        tool: 'test',
        params: {}
      })).rejects.toThrow('Invalid request: server is required');

      await expect(tools.executeTool({
        server: 'test',
        tool: '',
        params: {}
      })).rejects.toThrow('Invalid request: tool is required');
    });

    it('should handle non-existent server execution', async () => {
      // Arrange
      const invalidRequest = {
        server: 'non-existent-server',
        tool: 'test_tool',
        params: {}
      };

      // Act & Assert
      await expect(tools.executeTool(invalidRequest))
        .rejects.toThrow(); // Should throw an error for non-existent server
    });
  });

  describe('Performance integration', () => {
    it('should handle registry loading within performance thresholds', async () => {
      // Arrange
      const start = Date.now();

      // Act
      const newRegistry = new Registry(testRegistryPath);
      const servers = await newRegistry.load();
      const duration = Date.now() - start;

      // Assert
      expect(servers.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should load in under 100ms

      // Cleanup
      newRegistry.destroy();
    });

    it('should handle search operations within performance thresholds', async () => {
      // Arrange
      const start = Date.now();

      // Act
      const results = await tools.searchTools({ query: 'test' });
      const duration = Date.now() - start;

      // Assert
      expect(duration).toBeLessThan(50); // Should search in under 50ms
    });

    it('should handle concurrent search operations', async () => {
      // Arrange
      const searchPromises = Array.from({ length: 10 }, (_, i) =>
        tools.searchTools({ query: i % 2 === 0 ? 'gmail' : 'postgres' })
      );

      // Act
      const start = Date.now();
      const results = await Promise.all(searchPromises);
      const duration = Date.now() - start;

      // Assert
      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        if (index % 2 === 0) {
          expect(result[0]?.name).toBe('gmail-mcp');
        } else {
          expect(result[0]?.name).toBe('postgres-mcp');
        }
      });
      expect(duration).toBeLessThan(200); // All searches should complete quickly
    });
  });

  describe('Registry refresh integration', () => {
    it('should handle registry updates', async () => {
      // Arrange - Get initial state
      const initialResults = await tools.searchTools({ query: '' });
      const initialCount = initialResults.length;

      // Act - Reload registry (simulate update)
      const servers = await registry.load();
      search.index(servers);

      // Assert - Should maintain same results after reload
      const updatedResults = await tools.searchTools({ query: '' });
      expect(updatedResults).toHaveLength(initialCount);
      expect(updatedResults).toEqual(initialResults);
    });
  });

  describe('Component interaction', () => {
    it('should properly integrate registry with search', async () => {
      // Act
      const registryServers = registry.getServers();
      const searchAll = search.getAll();

      // Assert
      expect(registryServers).toEqual(searchAll);
      expect(registryServers.length).toBeGreaterThan(0);
    });

    it('should properly pass environment variables from registry to executor', async () => {
      // Arrange
      const servers = registry.getServers();
      const gmailServer = servers.find(s => s.name === 'gmail-mcp');

      // Assert
      expect(gmailServer).toBeDefined();
      expect(gmailServer?.env).toBeDefined();
      expect(gmailServer?.env?.GMAIL_API_KEY).toBe('test-key');
    });

    it('should maintain telemetry context across operations', async () => {
      // Arrange
      const correlationId = telemetry.generateCorrelationId();
      telemetry.setCorrelationId(correlationId);

      // Act
      await tools.searchTools({ query: 'gmail' });
      const retrievedId = telemetry.getCurrentCorrelationId();

      // Assert
      expect(retrievedId).toBe(correlationId);
    });
  });

  describe('Schema validation integration', () => {
    it('should return valid tool schemas', async () => {
      // Act
      const toolsList = await tools.getToolsList();

      // Assert
      toolsList.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
      });
    });

    it('should validate search results structure', async () => {
      // Act
      const results = await tools.searchTools({ query: 'gmail' });

      // Assert
      results.forEach(result => {
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('category');
        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('path');
        expect(typeof result.name).toBe('string');
        expect(typeof result.category).toBe('string');
        expect(typeof result.description).toBe('string');
        expect(typeof result.path).toBe('string');
      });
    });
  });
});