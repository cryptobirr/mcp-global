import { MCPServer, SearchOptions } from './types';

export class Search {
  private mcps: MCPServer[] = [];

  index(mcps: MCPServer[]): void {
    this.mcps = mcps;
  }

  find(query: string, options?: SearchOptions): MCPServer[] {
    const lowercaseQuery = query.toLowerCase();

    let results = this.mcps;

    // Filter by category if provided
    if (options?.category) {
      results = results.filter(mcp => mcp.category === options.category);
    }

    // If no query provided, return filtered results
    if (!query.trim()) {
      return results;
    }

    // Search across name, category, and description
    return results.filter(mcp => {
      const searchableText = [
        mcp.name,
        mcp.category,
        mcp.description
      ].join(' ').toLowerCase();

      return searchableText.includes(lowercaseQuery);
    });
  }

  getAll(): MCPServer[] {
    return [...this.mcps];
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}