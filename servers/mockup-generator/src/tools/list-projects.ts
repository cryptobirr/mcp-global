import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const listProjectsTool = {
  name: 'mockup_list_projects',
  description: 'List all projects with registered mockups',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleListProjects() {
  const registryPath = path.join(__dirname, '../storage/mockup-registry.json');

  if (!fs.existsSync(registryPath)) {
    return {
      content: [
        {
          type: 'text',
          text: '⚠️ No projects registered yet.\n\nRegistry file does not exist.',
        },
      ],
    };
  }

  let registry: any = {};
  try {
    const registryContent = fs.readFileSync(registryPath, 'utf-8');
    registry = JSON.parse(registryContent);
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Failed to read registry: ${err.message}`,
        },
      ],
    };
  }

  // Extract projects (exclude _metadata)
  const projects = Object.keys(registry).filter(key => key !== '_metadata');

  if (projects.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: '⚠️ No projects registered yet.\n\nUse mockup_register_component to add your first mockup.',
        },
      ],
    };
  }

  let result = `✅ Found ${projects.length} project(s) with registered mockups:\n\n`;

  for (const projectId of projects) {
    const issues = Object.keys(registry[projectId]);
    result += `**${projectId}** (${issues.length} issue${issues.length > 1 ? 's' : ''})\n`;

    for (const issueNumber of issues) {
      const components = registry[projectId][issueNumber];
      result += `  - Issue #${issueNumber}: ${components.length} component${components.length > 1 ? 's' : ''}\n`;
      for (const comp of components) {
        result += `    - ${comp.componentName} (${comp.componentType})\n`;
      }
    }
    result += '\n';
  }

  result += `\n**Registry last updated:** ${registry._metadata?.lastUpdated || 'Unknown'}`;

  return {
    content: [
      {
        type: 'text',
        text: result,
      },
    ],
    projects: registry, // Return full registry for programmatic access
  };
}
