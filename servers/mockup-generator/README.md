# Mockup Generator MCP Server

**Version:** 1.0.0
**Purpose:** Generate visual mockups and screenshots from React/React Native components during the UX design phase.

---

## Overview

This MCP server provides tools to:
1. Register React/React Native components from any project
2. Render components in a Next.js app with React Native Web support
3. Generate screenshots using Playwright at multiple viewports
4. Organize mockups by project and GitHub issue
5. Preview components in browser before screenshot generation

**Why MCP Server vs Standalone Service:**
- ✅ Direct integration with Claude Code (no HTTP APIs needed)
- ✅ File system access (no upload/download scripts)
- ✅ Built-in state management (MCP handles sessions)
- ✅ Zero deployment overhead (runs locally)
- ✅ Auto-discovered by Claude Code

---

## Architecture

```
/Users/mekonen/.mcp-global/servers/mockup-generator/
├── src/                           # MCP server TypeScript source
│   ├── index.ts                   # MCP server entry point
│   ├── tools/                     # MCP tool implementations
│   │   ├── register-component.ts
│   │   ├── generate-screenshots.ts
│   │   ├── get-screenshots.ts
│   │   ├── list-projects.ts
│   │   └── serve-preview.ts
│   └── storage/
│       └── mockup-registry.json   # Component registry
├── dist/                          # Compiled JavaScript
├── mockup-app/                    # Next.js renderer
│   ├── app/
│   │   ├── mockups/[projectId]/[issueNumber]/[screenName]/
│   │   │   └── page.tsx           # Dynamic route for components
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/                # Registered components stored here
│   │   └── [projectId]/
│   │       └── issue-[N]/
│   │           ├── LoginScreen.tsx
│   │           └── SignupScreen.tsx
│   ├── public/
│   │   └── screenshots/           # Generated screenshots
│   │       └── [projectId]/
│   │           └── issue-[N]/
│   │               ├── LoginScreen-mobile.png
│   │               ├── LoginScreen-tablet.png
│   │               └── LoginScreen-desktop.png
│   ├── next.config.ts             # React Native Web config
│   └── package.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## MCP Tools

### 1. `mockup_register_component`

Register a React/React Native component for mockup generation.

**Input:**
```json
{
  "projectId": "wwe-health",
  "issueNumber": 4,
  "componentName": "LoginScreen",
  "componentCode": "import React from 'react'; ...",
  "componentType": "react-native"
}
```

**Output:**
```
✅ Registered component: LoginScreen for wwe-health/issue-4

File saved to: /Users/mekonen/.mcp-global/servers/mockup-generator/mockup-app/components/wwe-health/issue-4/LoginScreen.tsx
Component type: react-native
```

**What it does:**
- Saves component code to `mockup-app/components/{projectId}/issue-{issueNumber}/{componentName}.tsx`
- Updates `mockup-registry.json` with component metadata
- Makes component available for rendering at URL: `/mockups/{projectId}/{issueNumber}/{componentName}`

---

### 2. `mockup_generate_screenshots`

Generate screenshots for registered components using Playwright.

**Input:**
```json
{
  "projectId": "wwe-health",
  "issueNumber": 4,
  "screens": ["LoginScreen", "SignupScreen"],
  "viewports": [
    { "name": "mobile", "width": 375, "height": 667 },
    { "name": "tablet", "width": 768, "height": 1024 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "serverPort": 3000
}
```

**Output:**
```
✅ Generated 6 screenshots for wwe-health/issue-4

Screenshots:
- LoginScreen-mobile.png
- LoginScreen-tablet.png
- LoginScreen-desktop.png
- SignupScreen-mobile.png
- SignupScreen-tablet.png
- SignupScreen-desktop.png
```

**What it does:**
- Launches Playwright browser
- Navigates to `http://localhost:{port}/mockups/{projectId}/{issueNumber}/{screen}` for each screen
- Takes full-page screenshots at each viewport size
- Saves screenshots to `mockup-app/public/screenshots/{projectId}/issue-{issueNumber}/`

**Prerequisites:**
- Next.js dev server must be running (use `mockup_serve_preview` first)

---

### 3. `mockup_get_screenshots`

Retrieve generated screenshot paths for a project/issue.

**Input:**
```json
{
  "projectId": "wwe-health",
  "issueNumber": 4
}
```

**Output:**
```
✅ Found 6 screenshots for wwe-health/issue-4

Screenshots:
- /Users/mekonen/.mcp-global/servers/mockup-generator/mockup-app/public/screenshots/wwe-health/issue-4/LoginScreen-mobile.png
- /Users/mekonen/.mcp-global/servers/mockup-generator/mockup-app/public/screenshots/wwe-health/issue-4/LoginScreen-tablet.png
- ...
```

**What it does:**
- Lists all `.png` files in `mockup-app/public/screenshots/{projectId}/issue-{issueNumber}/`
- Returns full file paths for copying to project directories

---

### 4. `mockup_list_projects`

List all projects with registered mockups.

**Input:** (none)

**Output:**
```
✅ Found 2 project(s) with registered mockups:

**wwe-health** (1 issue)
  - Issue #4: 4 components
    - LoginScreen (react-native)
    - SignupScreen (react-native)
    - BiometricPrompt (react-native)
    - PasswordResetScreen (react-native)

**project-x** (2 issues)
  - Issue #10: 2 components
    - Dashboard (react)
    - Settings (react)
  - Issue #12: 1 component
    - ProfileCard (react)

Registry last updated: 2025-10-27T15:45:30Z
```

**What it does:**
- Reads `mockup-registry.json`
- Lists all projects, issues, and components
- Shows component types and registration timestamps

---

### 5. `mockup_serve_preview`

Start/stop/check status of Next.js dev server for previewing mockups.

**Input:**
```json
{
  "port": 3000,
  "action": "start"  // or "stop" or "status"
}
```

**Output (start):**
```
✅ Started Next.js dev server on http://localhost:3000

**Access mockups at:**
  http://localhost:3000/mockups/{projectId}/{issueNumber}/{screenName}

**Example:**
  http://localhost:3000/mockups/wwe-health/4/LoginScreen

**To stop:**
  Use mockup_serve_preview with action: "stop"
```

**What it does:**
- **start:** Spawns Next.js dev server process in background (`npm run dev` in `mockup-app/`)
- **stop:** Kills Next.js dev server process
- **status:** Checks if dev server is running

**Note:** Server must be running before calling `mockup_generate_screenshots`

---

## Workflow Integration with UX Design SOP

### Step 6 of `sop-ux-ui-design.md`: Generate Visual Mockups

**Old approach (manual, deferred to development):**
- Create React Native components
- Document that mockups will be generated later
- No visual validation during UX design phase

**New approach (automated, using MCP server):**

```typescript
// 1. Register all components
for (const componentFile of componentFiles) {
  const componentCode = fs.readFileSync(componentFile, 'utf-8');
  const componentName = path.basename(componentFile, '.tsx');

  await mcp.mockup_register_component({
    projectId: "wwe-health",
    issueNumber: 4,
    componentName,
    componentCode,
    componentType: "react-native"
  });
}

// 2. Start Next.js dev server
await mcp.mockup_serve_preview({
  port: 3000,
  action: "start"
});

// 3. Wait for server to be ready (3-5 seconds)
await new Promise(resolve => setTimeout(resolve, 5000));

// 4. Generate screenshots
await mcp.mockup_generate_screenshots({
  projectId: "wwe-health",
  issueNumber: 4,
  screens: ["LoginScreen", "SignupScreen", "BiometricPrompt", "PasswordResetScreen"],
  viewports: [
    { name: "mobile", width: 375, height: 667 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 }
  ]
});

// 5. Get screenshot paths
const result = await mcp.mockup_get_screenshots({
  projectId: "wwe-health",
  issueNumber: 4
});

// 6. Copy screenshots to project directory
for (const screenshotPath of result.screenshots) {
  const filename = path.basename(screenshotPath);
  fs.copyFileSync(screenshotPath, `.dev/plan/issue-4-ui-mockups/${filename}`);
}

// 7. Stop dev server (optional, can leave running for manual preview)
await mcp.mockup_serve_preview({
  action: "stop"
});
```

**Result:** Fully automated mockup generation during UX design phase, before development starts.

---

## Manual Usage (Developer Testing)

### 1. Start Next.js Dev Server

```bash
cd /Users/mekonen/.mcp-global/servers/mockup-generator/mockup-app
npm run dev
```

Server runs on http://localhost:3000

### 2. Register a Component Manually

Create a component file:
```bash
mkdir -p mockup-app/components/test-project/issue-1
cat > mockup-app/components/test-project/issue-1/HelloWorld.tsx <<'EOF'
import React from 'react';
import { View, Text } from 'react-native';

export default function HelloWorld() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' }}>
      <Text style={{ fontSize: 32, fontWeight: 'bold' }}>Hello, World!</Text>
    </View>
  );
}
EOF
```

### 3. Preview in Browser

Open: http://localhost:3000/mockups/test-project/1/HelloWorld

### 4. Generate Screenshot

Use Playwright manually:
```bash
cd /Users/mekonen/.mcp-global/servers/mockup-generator
npx playwright screenshot \
  http://localhost:3000/mockups/test-project/1/HelloWorld \
  mockup-app/public/screenshots/test-project/issue-1/HelloWorld-mobile.png \
  --viewport-size=375,667 \
  --full-page
```

---

## React Native Web Compatibility

### Supported Components

✅ **Fully supported (render correctly in browser):**
- View → `<div>`
- Text → `<span>`
- TextInput → `<input>` or `<textarea>`
- TouchableOpacity → `<button>` with opacity effect
- ScrollView → `<div>` with `overflow: scroll`
- Image → `<img>`
- ActivityIndicator → CSS spinner animation
- SafeAreaView → `<div>` with padding

### Partially Supported (may need adjustments)

⚠️ **Works but with caveats:**
- StyleSheet → Converted to inline styles (may not match exact mobile appearance)
- Animated → CSS animations (simpler than native)
- Modal → `<div>` overlay (not native modal)
- FlatList → `<div>` with mapping (virtualization not supported in web)

### Not Supported (placeholder/skip)

❌ **Not available in React Native Web:**
- Biometric authentication (expo-local-authentication) → Show placeholder UI
- Native modules (camera, geolocation, etc.) → Show placeholder UI
- Platform-specific APIs → Use conditional rendering

**Workaround for biometric components:**
```typescript
// BiometricPrompt.tsx
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // Show placeholder UI for screenshot
  return <PlaceholderBiometricUI />;
} else {
  // Real biometric prompt for mobile
  return <ActualBiometricPrompt />;
}
```

---

## Troubleshooting

### Issue: "Component Not Found" in browser

**Cause:** Component not registered or file path incorrect

**Fix:**
1. Check component is registered: `mockup_list_projects`
2. Verify file exists: `ls mockup-app/components/{projectId}/issue-{N}/`
3. Ensure component name matches file name exactly (case-sensitive)

---

### Issue: Playwright screenshots fail with "ECONNREFUSED"

**Cause:** Next.js dev server not running

**Fix:**
1. Start dev server: `mockup_serve_preview` with `action: "start"`
2. Wait 5 seconds for server to fully start
3. Verify server is running: `curl http://localhost:3000` should return HTML
4. Retry screenshot generation

---

### Issue: React Native components render incorrectly

**Cause:** Some RN components don't have perfect web equivalents

**Fix:**
1. Simplify component for mockup purposes (remove native-specific code)
2. Use conditional rendering: `Platform.OS === 'web'` → show simplified version
3. For critical native features (biometrics), show placeholder UI in mockups

---

### Issue: Screenshots have missing images or broken layouts

**Cause:** Assets not loaded or fonts not available

**Fix:**
1. Use web-safe fonts (system-ui, sans-serif, etc.)
2. For images, use publicly accessible URLs or base64-encoded data URIs
3. Add `waitUntil: 'networkidle'` to Playwright (already configured)
4. Increase wait time before screenshot: `await page.waitForTimeout(1000)`

---

## Future Enhancements

### Planned Features

- [ ] **Interactive state capture:** Screenshot hover, focus, error states automatically
- [ ] **Accessibility testing:** Run axe-core on components, report WCAG violations
- [ ] **Visual regression testing:** Compare screenshots across commits (Playwright Visual Comparisons)
- [ ] **Component gallery:** Generate static site with all mockups (Storybook-like)
- [ ] **Annotation tools:** Add annotations to screenshots (arrows, text, highlights)
- [ ] **Mobile device frames:** Wrap screenshots in iPhone/Android frames
- [ ] **Dark mode:** Generate light + dark mode screenshots automatically
- [ ] **Animation capture:** Record GIF/MP4 of component animations
- [ ] **Real device testing:** Integrate with BrowserStack for real iOS/Android screenshots

---

## Credits

**Built for:** WWE Health App project (and all future projects)
**Part of:** Autonomous UX/UI Design SOP workflow
**Technology:** MCP Server + Next.js + React Native Web + Playwright
**Created:** 2025-10-27T15:45:30Z

---

## License

MIT
