import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getScreenshotsTool = {
  name: 'mockup_get_screenshots',
  description: 'Retrieve generated screenshot paths for a project/issue',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier'
      },
      issueNumber: {
        type: 'number',
        description: 'GitHub issue number'
      },
    },
    required: ['projectId', 'issueNumber'],
  },
};

export async function handleGetScreenshots(args: any) {
  const { projectId, issueNumber } = args;

  const screenshotDir = path.join(
    __dirname,
    '../../mockup-app/public/screenshots',
    projectId,
    `issue-${issueNumber}`
  );

  if (!fs.existsSync(screenshotDir)) {
    return {
      content: [
        {
          type: 'text',
          text: `⚠️ No screenshots found for ${projectId}/issue-${issueNumber}\n\nDirectory does not exist: ${screenshotDir}\n\nRun mockup_generate_screenshots first.`,
        },
      ],
    };
  }

  const files = fs.readdirSync(screenshotDir);
  const screenshots = files
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(screenshotDir, f));

  if (screenshots.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `⚠️ No screenshots found for ${projectId}/issue-${issueNumber}\n\nDirectory exists but is empty: ${screenshotDir}`,
        },
      ],
    };
  }

  let result = `✅ Found ${screenshots.length} screenshots for ${projectId}/issue-${issueNumber}\n\n`;
  result += `Screenshots:\n${screenshots.map(p => `- ${p}`).join('\n')}`;

  return {
    content: [
      {
        type: 'text',
        text: result,
      },
    ],
    screenshots, // Return array for programmatic access
  };
}
