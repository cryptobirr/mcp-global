import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Viewport {
  name: string;
  width: number;
  height: number;
}

async function generateScreenshots(
  projectId: string,
  issueNumber: number,
  screens: string[],
  serverPort: number = 3001
) {
  const viewports: Viewport[] = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  // Ensure screenshot directory exists
  const screenshotDir = path.join(
    __dirname,
    '../mockup-app/public/screenshots',
    projectId,
    `issue-${issueNumber}`
  );

  fs.mkdirSync(screenshotDir, { recursive: true });

  const generatedScreenshots: string[] = [];
  const errors: string[] = [];

  console.log(`\n📸 Starting screenshot generation...`);
  console.log(`Project: ${projectId}, Issue: #${issueNumber}`);
  console.log(`Screens: ${screens.join(', ')}`);
  console.log(`Server: http://localhost:${serverPort}\n`);

  const browser = await chromium.launch({ headless: true });

  for (const screen of screens) {
    console.log(`\n🎬 Processing: ${screen}`);

    for (const viewport of viewports) {
      try {
        const page = await browser.newPage();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        const url = `http://localhost:${serverPort}/mockups/${projectId}/${issueNumber}/${screen}`;

        console.log(`  📱 ${viewport.name} (${viewport.width}x${viewport.height})`);

        // Navigate with timeout
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        // Wait for React Native Web to render
        await page.waitForTimeout(2000);

        const screenshotPath = path.join(screenshotDir, `${screen}-${viewport.name}.png`);
        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });

        generatedScreenshots.push(screenshotPath);
        console.log(`  ✅ Saved: ${path.basename(screenshotPath)}`);

        await page.close();
      } catch (err: any) {
        const errorMsg = `${screen} at ${viewport.name}: ${err.message}`;
        errors.push(errorMsg);
        console.log(`  ❌ Failed: ${errorMsg}`);
      }
    }
  }

  await browser.close();

  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Generated: ${generatedScreenshots.length} screenshots`);
  console.log(`  ❌ Failed: ${errors.length} screenshots`);

  if (generatedScreenshots.length > 0) {
    console.log(`\n📂 Screenshots saved to:`);
    console.log(`  ${screenshotDir}`);
  }

  if (errors.length > 0) {
    console.log(`\n⚠️ Errors:`);
    errors.forEach(err => console.log(`  - ${err}`));
  }

  return {
    generatedScreenshots,
    errors,
    screenshotDir
  };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectId = process.argv[2] || 'wwe-health';
  const issueNumber = parseInt(process.argv[3] || '4');
  const screens = process.argv.slice(4).length > 0
    ? process.argv.slice(4)
    : ['LoginScreen', 'SignupScreen', 'BiometricPrompt', 'PasswordResetScreen'];

  generateScreenshots(projectId, issueNumber, screens)
    .then(result => {
      console.log(`\n✨ Done!`);
      process.exit(result.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error(`\n❌ Fatal error:`, error);
      process.exit(1);
    });
}

export { generateScreenshots };
