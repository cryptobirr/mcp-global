import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateScreenshotsTool = {
  name: 'mockup_generate_screenshots',
  description: 'Generate screenshots for registered components using Playwright',
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
      screens: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of screen names to screenshot (e.g., ["LoginScreen", "SignupScreen"])'
      },
      viewports: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
        description: 'Optional custom viewports (defaults to mobile/tablet/desktop)'
      },
      serverPort: {
        type: 'number',
        description: 'Port where Next.js dev server is running (default: 3000)'
      },
    },
    required: ['projectId', 'issueNumber', 'screens'],
  },
};

export async function handleGenerateScreenshots(args: any) {
  const { projectId, issueNumber, screens, viewports, serverPort = 3000 } = args;

  const defaultViewports = viewports || [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  // Ensure screenshot directory exists
  const screenshotDir = path.join(
    __dirname,
    '../../mockup-app/public/screenshots',
    projectId,
    `issue-${issueNumber}`
  );

  fs.mkdirSync(screenshotDir, { recursive: true });

  const generatedScreenshots: string[] = [];
  const errors: string[] = [];

  try {
    const browser = await chromium.launch({ headless: true });

    for (const screen of screens) {
      for (const viewport of defaultViewports) {
        try {
          const page = await browser.newPage();
          await page.setViewportSize({ width: viewport.width, height: viewport.height });

          const url = `http://localhost:${serverPort}/mockups/${projectId}/${issueNumber}/${screen}`;

          // Navigate with timeout
          await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30000
          });

          // Wait a bit for animations to settle
          await page.waitForTimeout(500);

          const screenshotPath = path.join(screenshotDir, `${screen}-${viewport.name}.png`);
          await page.screenshot({
            path: screenshotPath,
            fullPage: true
          });

          generatedScreenshots.push(screenshotPath);
          await page.close();
        } catch (err: any) {
          errors.push(`Failed to screenshot ${screen} at ${viewport.name}: ${err.message}`);
        }
      }
    }

    await browser.close();

    if (generatedScreenshots.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to generate any screenshots.\n\nErrors:\n${errors.join('\n')}\n\n⚠️ Make sure the Next.js dev server is running on port ${serverPort}:\n  cd /Users/mekonen/.mcp-global/servers/mockup-generator/mockup-app\n  npm run dev`,
          },
        ],
      };
    }

    let result = `✅ Generated ${generatedScreenshots.length} screenshots for ${projectId}/issue-${issueNumber}\n\n`;
    result += `Screenshots:\n${generatedScreenshots.map(p => `- ${path.basename(p)}`).join('\n')}`;

    if (errors.length > 0) {
      result += `\n\n⚠️ Warnings:\n${errors.join('\n')}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Error generating screenshots: ${err.message}\n\n⚠️ Make sure the Next.js dev server is running:\n  cd /Users/mekonen/.mcp-global/servers/mockup-generator/mockup-app\n  npm run dev`,
        },
      ],
    };
  }
}
