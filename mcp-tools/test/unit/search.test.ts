import { Search } from '../../src/search';
import { MCPServer } from '../../src/types';

describe('Search', () => {
  let search: Search;
  const mockMCPs: MCPServer[] = [
    {
      name: 'gmail-mcp',
      category: 'productivity',
      description: 'Gmail integration for sending and reading emails',
      path: '/path/to/gmail-mcp'
    },
    {
      name: 'postgres-mcp',
      category: 'database',
      description: 'PostgreSQL database operations',
      path: '/path/to/postgres-mcp'
    },
    {
      name: 'weather-mcp',
      category: 'api',
      description: 'Weather information and forecasts',
      path: '/path/to/weather-mcp'
    },
    {
      name: 'postgresql-server',
      category: 'database',
      description: 'Advanced PostgreSQL server operations',
      path: '/path/to/postgresql-server'
    }
  ];

  beforeEach(() => {
    search = new Search();
    search.index(mockMCPs);
  });

  describe('find', () => {
    it('should find MCPs by name keyword', () => {
      // Act
      const results = search.find('gmail');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('gmail-mcp');
    });

    it('should find MCPs by description keyword', () => {
      // Act
      const results = search.find('weather');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('weather-mcp');
    });

    it('should filter by category when provided', () => {
      // Act
      const results = search.find('', { category: 'database' });

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every(mcp => mcp.category === 'database')).toBe(true);
    });

    it('should combine keyword and category filter', () => {
      // Act
      const results = search.find('postgres', { category: 'database' });

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every(mcp => mcp.category === 'database')).toBe(true);
      expect(results.every(mcp => mcp.name.includes('postgres'))).toBe(true);
    });

    it('should be case insensitive', () => {
      // Act
      const results = search.find('GMAIL');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('gmail-mcp');
    });

    it('should handle partial matches', () => {
      // Act
      const results = search.find('postgres');

      // Assert
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toContain('postgres-mcp');
      expect(results.map(r => r.name)).toContain('postgresql-server');
    });

    it('should return empty array when no matches found', () => {
      // Act
      const results = search.find('nonexistent');

      // Assert
      expect(results).toHaveLength(0);
    });

    it('should escape special regex characters', () => {
      // Arrange
      const specialMCPs: MCPServer[] = [
        {
          name: 'test[.*]mcp',
          category: 'test',
          description: 'Test MCP with special chars',
          path: '/path/to/test'
        }
      ];
      search.index(specialMCPs);

      // Act
      const results = search.find('[.*]');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('test[.*]mcp');
    });

    it('should search across name, category, and description', () => {
      // Act
      const emailResults = search.find('email');
      const prodResults = search.find('productivity');
      const pgResults = search.find('PostgreSQL');

      // Assert
      expect(emailResults).toHaveLength(1);
      expect(emailResults[0].name).toBe('gmail-mcp');

      expect(prodResults).toHaveLength(1);
      expect(prodResults[0].name).toBe('gmail-mcp');

      expect(pgResults).toHaveLength(2);
    });
  });

  describe('performance', () => {
    it('should search 1000+ tools in under 50ms', () => {
      // Arrange
      const largeMCPList: MCPServer[] = [];
      for (let i = 0; i < 1000; i++) {
        largeMCPList.push({
          name: `mcp-${i}`,
          category: i % 10 === 0 ? 'target' : 'other',
          description: `Description for MCP ${i}`,
          path: `/path/to/mcp-${i}`
        });
      }
      search.index(largeMCPList);

      // Act
      const start = Date.now();
      const results = search.find('target');
      const duration = Date.now() - start;

      // Assert
      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
    });
  });

  describe('index', () => {
    it('should replace existing index when called multiple times', () => {
      // Arrange
      const newMCPs: MCPServer[] = [
        {
          name: 'new-mcp',
          category: 'new',
          description: 'New MCP',
          path: '/path/to/new-mcp'
        }
      ];

      // Act
      search.index(newMCPs);
      const results = search.find('gmail');
      const newResults = search.find('new');

      // Assert
      expect(results).toHaveLength(0);
      expect(newResults).toHaveLength(1);
      expect(newResults[0].name).toBe('new-mcp');
    });
  });

  describe('getAll', () => {
    it('should return all indexed MCPs', () => {
      // Act
      const all = search.getAll();

      // Assert
      expect(all).toHaveLength(mockMCPs.length);
      expect(all).toEqual(mockMCPs);
    });
  });
});