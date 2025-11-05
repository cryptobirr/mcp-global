import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let devServerProcess: any = null;

export const servePreviewTool = {
  name: 'mockup_serve_preview',
  description: 'Start Next.js dev server to preview mockups in browser',
  inputSchema: {
    type: 'object',
    properties: {
      port: {
        type: 'number',
        description: 'Port to run dev server on (default: 3000)'
      },
      action: {
        type: 'string',
        enum: ['start', 'stop', 'status'],
        description: 'Action to perform (start/stop/status)'
      },
    },
  },
};

export async function handleServePreview(args: any) {
  const { port = 3000, action = 'start' } = args;

  const mockupAppDir = path.join(__dirname, '../../mockup-app');

  if (action === 'status') {
    if (devServerProcess && !devServerProcess.killed) {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Next.js dev server is running on http://localhost:${port}\n\nAccess mockups at:\n  http://localhost:${port}/mockups/{projectId}/{issueNumber}/{screenName}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ Next.js dev server is not running.\n\nRun with action: "start" to start the server.',
          },
        ],
      };
    }
  }

  if (action === 'stop') {
    if (devServerProcess && !devServerProcess.killed) {
      devServerProcess.kill();
      devServerProcess = null;
      return {
        content: [
          {
            type: 'text',
            text: '✅ Stopped Next.js dev server.',
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: '⚠️ Next.js dev server is not running.',
          },
        ],
      };
    }
  }

  if (action === 'start') {
    if (devServerProcess && !devServerProcess.killed) {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Next.js dev server is already running on http://localhost:${port}`,
          },
        ],
      };
    }

    try {
      // Start Next.js dev server
      devServerProcess = spawn('npm', ['run', 'dev', '--', '-p', port.toString()], {
        cwd: mockupAppDir,
        stdio: 'ignore',
        detached: true,
      });

      // Wait a bit for server to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      return {
        content: [
          {
            type: 'text',
            text: `✅ Started Next.js dev server on http://localhost:${port}\n\n**Access mockups at:**\n  http://localhost:${port}/mockups/{projectId}/{issueNumber}/{screenName}\n\n**Example:**\n  http://localhost:${port}/mockups/wwe-health/4/LoginScreen\n\n**To stop:**\n  Use mockup_serve_preview with action: "stop"`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to start Next.js dev server: ${err.message}\n\n**Manual start:**\n  cd ${mockupAppDir}\n  npm run dev -- -p ${port}`,
          },
        ],
      };
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: '❌ Invalid action. Use "start", "stop", or "status".',
      },
    ],
  };
}
