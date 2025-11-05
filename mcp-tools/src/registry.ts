import * as fs from 'fs/promises';
import * as path from 'path';
import { MCPServer, Registry as RegistryData, RegistryParseError, FileNotFoundError } from './types';

export class Registry {
  private refreshInterval?: any;
  private cachedServers?: MCPServer[];
  private readonly SERVERS_DIR: string;

  // eslint-disable-next-line no-unused-vars
  constructor(
    private registryPath: string,
    private refreshIntervalMs: number = 300000, // 5 minutes default
    serversDir?: string
  ) {
    this.SERVERS_DIR = serversDir || process.env.MCP_SERVERS_DIR ||
      `${process.env.HOME}/.mcp-global/servers/binaries`;
  }

  async load(): Promise<MCPServer[]> {
    // Try to discover MCPs from servers directory first (fallback mechanism)
    const discoveredServers = await this.discoverMCPServers();

    // Try to load from registry file for any additional configuration
    let registryServers: MCPServer[] = [];
    let registryFileError: any = null;

    try {
      const data = await fs.readFile(this.registryPath, 'utf8');
      const registry: RegistryData = JSON.parse(data);
      registryServers = Object.values(registry.servers || {});
    } catch (error: any) {
      registryFileError = error;

      // If no discovered servers and registry has issues, throw the registry error
      if (discoveredServers.length === 0) {
        if (error.code === 'ENOENT' || error.message.includes('no such file or directory')) {
          throw new FileNotFoundError(this.registryPath);
        }
        if (error instanceof SyntaxError) {
          throw new RegistryParseError(error.message);
        }
        throw error;
      }
      // Otherwise, continue with discovered servers as fallback
    }

    // Merge discovered and registry servers, prioritizing discovered ones
    const serverMap = new Map<string, MCPServer>();

    // Add registry servers first
    registryServers.forEach(server => {
      serverMap.set(server.name, server);
    });

    // Add discovered servers (will override registry entries with same name)
    discoveredServers.forEach(server => {
      serverMap.set(server.name, server);
    });

    this.cachedServers = Array.from(serverMap.values());

    // Set up auto-refresh if not already set
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        this.load().catch(() => {
          // Handle reload errors silently
        });
      }, this.refreshIntervalMs);
    }

    return this.cachedServers;
  }

  private async discoverMCPServers(): Promise<MCPServer[]> {
    const servers: MCPServer[] = [];

    try {
      const serverDirs = await fs.readdir(this.SERVERS_DIR, { withFileTypes: true });

      for (const dir of serverDirs) {
        if (dir.isDirectory() && !dir.name.startsWith('.')) {
          const serverPath = path.join(this.SERVERS_DIR, dir.name);
          const server = await this.parseServerFromDirectory(serverPath, dir.name);

          if (server) {
            servers.push(server);
          }
        }
      }
    } catch (error) {
      // If servers directory doesn't exist, return empty array
      console.warn(`Could not discover MCP servers from ${this.SERVERS_DIR}:`, error);
    }

    return servers;
  }

  private async parseServerFromDirectory(serverPath: string, dirName: string): Promise<MCPServer | null> {
    try {
      const packageJsonPath = path.join(serverPath, 'package.json');
      const data = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(data);

      // Determine entry point
      let entryPoint = 'index.js';
      if (packageJson.main) {
        entryPoint = packageJson.main;
      } else if (packageJson.bin) {
        if (typeof packageJson.bin === 'string') {
          entryPoint = packageJson.bin;
        } else {
          // Take the first binary entry
          entryPoint = Object.values(packageJson.bin)[0] as string;
        }
      }

      // Determine category from keywords and package name
      const category = this.inferCategory(packageJson.keywords || [], packageJson.name || dirName);

      // Create absolute path to entry point
      const absolutePath = path.resolve(serverPath, entryPoint);

      return {
        name: dirName,
        category,
        description: packageJson.description || `MCP server: ${dirName}`,
        path: absolutePath,
        env: {} // No env vars by default, can be overridden by registry file
      };
    } catch (error) {
      console.warn(`Could not parse MCP server from ${serverPath}:`, error);
      return null;
    }
  }

  private inferCategory(keywords: string[], name: string): string {
    const keywordStr = keywords.join(' ').toLowerCase();
    const nameStr = name.toLowerCase();
    const combined = `${keywordStr} ${nameStr}`;

    // Define category mappings
    const categoryMappings = [
      { keywords: ['database', 'postgres', 'sql', 'db'], category: 'database' },
      { keywords: ['google', 'gmail', 'calendar', 'drive', 'sheets'], category: 'google' },
      { keywords: ['productivity', 'todo', 'task', 'excel', 'time', 'tracker'], category: 'productivity' },
      { keywords: ['api', 'rest', 'http', 'web'], category: 'api' },
      { keywords: ['browser', 'playwright', 'web', 'automation'], category: 'automation' },
      { keywords: ['file', 'pdf', 'document', 'edit'], category: 'files' },
      { keywords: ['finance', 'ynab', 'budget'], category: 'finance' },
      { keywords: ['media', 'youtube', 'video'], category: 'media' },
      { keywords: ['storage', 'dropbox', 'cloud'], category: 'storage' },
      { keywords: ['auth', 'authentication', 'login'], category: 'auth' },
      { keywords: ['log', 'event', 'monitor'], category: 'monitoring' }
    ];

    for (const mapping of categoryMappings) {
      if (mapping.keywords.some(keyword => combined.includes(keyword))) {
        return mapping.category;
      }
    }

    return 'utilities'; // Default category
  }

  getServers(): MCPServer[] {
    return this.cachedServers || [];
  }

  destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }
}