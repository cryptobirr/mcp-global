import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const registerComponentTool = {
  name: 'mockup_register_component',
  description: 'Register a React/React Native component for mockup generation',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier (e.g., "wwe-health")'
      },
      issueNumber: {
        type: 'number',
        description: 'GitHub issue number'
      },
      componentName: {
        type: 'string',
        description: 'Component name without extension (e.g., "LoginScreen")'
      },
      componentCode: {
        type: 'string',
        description: 'Full TypeScript/TSX component code'
      },
      componentType: {
        type: 'string',
        enum: ['react', 'react-native'],
        description: 'Type of component (react for web, react-native for mobile)'
      },
    },
    required: ['projectId', 'issueNumber', 'componentName', 'componentCode'],
  },
};

export async function handleRegisterComponent(args: any) {
  const { projectId, issueNumber, componentName, componentCode, componentType = 'react-native' } = args;

  // Determine component directory
  const componentDir = path.join(
    __dirname,
    '../../mockup-app/components',
    projectId,
    `issue-${issueNumber}`
  );

  // Create directory if it doesn't exist
  fs.mkdirSync(componentDir, { recursive: true });

  // Write component file
  const filePath = path.join(componentDir, `${componentName}.tsx`);
  fs.writeFileSync(filePath, componentCode, 'utf-8');

  // Update registry
  const registryPath = path.join(__dirname, '../storage/mockup-registry.json');
  let registry: any = {};

  try {
    const registryContent = fs.readFileSync(registryPath, 'utf-8');
    registry = JSON.parse(registryContent);
  } catch (err) {
    // If registry doesn't exist or is invalid, start fresh
    registry = { _metadata: { description: 'Registry of all registered mockup components', version: '1.0.0' } };
  }

  // Initialize project and issue if needed
  if (!registry[projectId]) registry[projectId] = {};
  if (!registry[projectId][issueNumber]) registry[projectId][issueNumber] = [];

  // Add component to registry (avoid duplicates)
  const existingIndex = registry[projectId][issueNumber].findIndex(
    (c: any) => c.componentName === componentName
  );

  const componentEntry = {
    componentName,
    componentType,
    filePath,
    registeredAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    registry[projectId][issueNumber][existingIndex] = componentEntry;
  } else {
    registry[projectId][issueNumber].push(componentEntry);
  }

  // Update metadata
  registry._metadata.lastUpdated = new Date().toISOString();

  // Save registry
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

  return {
    content: [
      {
        type: 'text',
        text: `✅ Registered component: ${componentName} for ${projectId}/issue-${issueNumber}\n\nFile saved to: ${filePath}\nComponent type: ${componentType}`,
      },
    ],
  };
}
