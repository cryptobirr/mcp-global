import { Tools } from '../../src/tools';
import { Search } from '../../src/search';
import { Executor } from '../../src/executor';
import { Registry } from '../../src/registry';
import { MCPServer } from '../../src/types';

jest.mock('../../src/search');
jest.mock('../../src/executor');
jest.mock('../../src/registry');

const MockSearch = Search as jest.MockedClass<typeof Search>;
const MockExecutor = Executor as jest.MockedClass<typeof Executor>;
const MockRegistry = Registry as jest.MockedClass<typeof Registry>;

describe('Tools', () => {
  let tools: Tools;
  let mockSearch: jest.Mocked<Search>;
  let mockExecutor: jest.Mocked<Executor>;
  let mockRegistry: jest.Mocked<Registry>;

  const mockMCPs: MCPServer[] = [
    {
      name: 'gmail-mcp',
      category: 'productivity',
      description: 'Gmail integration',
      path: '/path/to/gmail-mcp'
    },
    {
      name: 'postgres-mcp',
      category: 'database',
      description: 'PostgreSQL operations',
      path: '/path/to/postgres-mcp'
    },
    {
      name: 'weather-mcp',
      category: 'api',
      description: 'Weather information',
      path: '/path/to/weather-mcp'
    }
  ];

  beforeEach(() => {
    mockSearch = new MockSearch() as jest.Mocked<Search>;
    mockExecutor = new MockExecutor() as jest.Mocked<Executor>;
    mockRegistry = new MockRegistry('test') as jest.Mocked<Registry>;

    mockRegistry.getServers.mockReturnValue(mockMCPs);
    mockSearch.getAll.mockReturnValue(mockMCPs);

    tools = new Tools(mockSearch, mockExecutor, mockRegistry);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchTools', () => {
    it('should return array of matching tools', async () => {
      // Arrange
      const expectedResults = [mockMCPs[0]];
      mockSearch.find.mockReturnValue(expectedResults);

      // Act
      const result = await tools.searchTools({ query: 'gmail' });

      // Assert
      expect(result).toEqual(expectedResults);
      expect(mockSearch.find).toHaveBeenCalledWith('gmail', undefined);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('name');
    });

    it('should handle search with category filter', async () => {
      // Arrange
      const expectedResults = [mockMCPs[1]];
      mockSearch.find.mockReturnValue(expectedResults);

      // Act
      const result = await tools.searchTools({
        query: 'postgres',
        category: 'database'
      });

      // Assert
      expect(result).toEqual(expectedResults);
      expect(mockSearch.find).toHaveBeenCalledWith('postgres', { category: 'database' });
    });

    it('should handle empty query', async () => {
      // Arrange
      mockSearch.find.mockReturnValue(mockMCPs);

      // Act
      const result = await tools.searchTools({ query: '' });

      // Assert
      expect(result).toEqual(mockMCPs);
      expect(mockSearch.find).toHaveBeenCalledWith('', undefined);
    });

    it('should return empty array when no matches found', async () => {
      // Arrange
      mockSearch.find.mockReturnValue([]);

      // Act
      const result = await tools.searchTools({ query: 'nonexistent' });

      // Assert
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should validate search tool schema', async () => {
      // Arrange
      mockSearch.find.mockReturnValue([mockMCPs[0]]);

      // Act
      const result = await tools.searchTools({ query: 'gmail' });

      // Assert
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('name');
        expect(result[0]).toHaveProperty('category');
        expect(result[0]).toHaveProperty('description');
        expect(result[0]).toHaveProperty('path');
      }
    });
  });

  describe('executeTool', () => {
    it('should execute tool and return result', async () => {
      // Arrange
      const request = {
        server: 'gmail-mcp',
        tool: 'send_email',
        params: { to: 'test@example.com', subject: 'Test' }
      };
      const expectedResult = { result: 'Email sent successfully' };
      mockExecutor.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await tools.executeTool(request);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockExecutor.execute).toHaveBeenCalledWith(request, undefined, undefined);
    });

    it('should pass environment variables to executor', async () => {
      // Arrange
      const request = {
        server: 'gmail-mcp',
        tool: 'send_email',
        params: { to: 'test@example.com' }
      };
      const envVars = { API_KEY: 'test-key' };
      const expectedResult = { result: 'success' };
      mockExecutor.execute.mockResolvedValue(expectedResult);

      // Get the server from registry to access env vars
      const server = mockMCPs.find(mcp => mcp.name === request.server);
      server!.env = envVars;

      // Act
      const result = await tools.executeTool(request);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockExecutor.execute).toHaveBeenCalledWith(request, envVars, undefined);
    });

    it('should handle execution timeout parameter', async () => {
      // Arrange
      const request = {
        server: 'slow-mcp',
        tool: 'slow_operation',
        params: {}
      };
      const timeout = 5000;
      const expectedResult = { result: 'completed' };
      mockExecutor.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await tools.executeTool(request, timeout);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockExecutor.execute).toHaveBeenCalledWith(request, undefined, timeout);
    });

    it('should return validation error for missing required parameters', async () => {
      // Arrange
      const invalidRequest = {
        server: '',
        tool: 'test_tool',
        params: {}
      };

      // Act & Assert
      await expect(tools.executeTool(invalidRequest)).rejects.toThrow('Invalid request: server is required');
    });

    it('should return validation error for missing tool name', async () => {
      // Arrange
      const invalidRequest = {
        server: 'test-mcp',
        tool: '',
        params: {}
      };

      // Act & Assert
      await expect(tools.executeTool(invalidRequest)).rejects.toThrow('Invalid request: tool is required');
    });

    it('should validate execute tool schema', async () => {
      // Arrange
      const request = {
        server: 'test-mcp',
        tool: 'test_tool',
        params: { param1: 'value1' }
      };
      const expectedResult = { result: 'success', data: { id: 1 } };
      mockExecutor.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await tools.executeTool(request);

      // Assert
      expect(typeof result === 'object').toBe(true);
      expect(result).toBeDefined();
    });
  });

  describe('listCategories', () => {
    it('should return unique category strings', async () => {
      // Arrange
      const expectedCategories = ['api', 'database', 'productivity'];

      // Act
      const result = await tools.listCategories();

      // Assert
      expect(result).toEqual(expectedCategories);
      expect(Array.isArray(result)).toBe(true);
      expect(result.every(cat => typeof cat === 'string')).toBe(true);
    });

    it('should return empty array when no MCPs available', async () => {
      // Arrange
      mockSearch.getAll.mockReturnValue([]);

      // Act
      const result = await tools.listCategories();

      // Assert
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should deduplicate categories', async () => {
      // Arrange
      const mcpsWithDuplicates: MCPServer[] = [
        { name: 'mcp1', category: 'database', description: 'Test 1', path: '/path1' },
        { name: 'mcp2', category: 'database', description: 'Test 2', path: '/path2' },
        { name: 'mcp3', category: 'api', description: 'Test 3', path: '/path3' }
      ];
      mockSearch.getAll.mockReturnValue(mcpsWithDuplicates);

      // Act
      const result = await tools.listCategories();

      // Assert
      expect(result).toEqual(['api', 'database']);
      expect(result.length).toBe(2);
    });

    it('should sort categories alphabetically', async () => {
      // Arrange
      const mcpsUnsorted: MCPServer[] = [
        { name: 'mcp1', category: 'z-category', description: 'Test 1', path: '/path1' },
        { name: 'mcp2', category: 'a-category', description: 'Test 2', path: '/path2' },
        { name: 'mcp3', category: 'm-category', description: 'Test 3', path: '/path3' }
      ];
      mockSearch.getAll.mockReturnValue(mcpsUnsorted);

      // Act
      const result = await tools.listCategories();

      // Assert
      expect(result).toEqual(['a-category', 'm-category', 'z-category']);
    });
  });

  describe('getToolsList', () => {
    it('should return all available tools with metadata', async () => {
      // Act
      const result = await tools.getToolsList();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([
        {
          name: 'search_tools',
          description: 'Search for available MCP tools by keyword and category',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              category: { type: 'string', description: 'Category filter' }
            },
            required: ['query']
          }
        },
        {
          name: 'execute_tool',
          description: 'Execute a specific MCP tool',
          inputSchema: {
            type: 'object',
            properties: {
              server: { type: 'string', description: 'MCP server name' },
              tool: { type: 'string', description: 'Tool name to execute' },
              params: { type: 'object', description: 'Tool parameters' }
            },
            required: ['server', 'tool', 'params']
          }
        },
        {
          name: 'list_categories',
          description: 'List all available MCP categories',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'list_mcps',
          description: 'List all MCP servers with fast response and hierarchical detail levels',
          inputSchema: {
            type: 'object',
            properties: {
              detail: {
                type: 'string',
                enum: ['summary', 'full'],
                description: 'Level of detail to return (summary for fast response, full for complete info)'
              },
              category: {
                type: 'string',
                description: 'Filter by category'
              },
              includeTools: {
                type: 'boolean',
                description: 'Include tools information in full detail mode'
              }
            }
          }
        },
        {
          name: 'get_mcp_details',
          description: 'Get detailed information about a specific MCP server',
          inputSchema: {
            type: 'object',
            properties: {
              mcpName: {
                type: 'string',
                description: 'Name of the MCP server'
              },
              includeTools: {
                type: 'boolean',
                description: 'Include tools information'
              }
            },
            required: ['mcpName']
          }
        }
      ]);
    });
  });
});