export default function Home() {
  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Mockup Generator - Component Preview</h1>
      <p>This server renders React and React Native components for screenshot generation.</p>

      <h2>Usage</h2>
      <p>Access mockups at:</p>
      <code style={{
        display: 'block',
        padding: '10px',
        background: '#f5f5f5',
        borderRadius: '4px',
        marginTop: '10px'
      }}>
        /mockups/[projectId]/[issueNumber]/[screenName]
      </code>

      <h3>Example:</h3>
      <code style={{
        display: 'block',
        padding: '10px',
        background: '#f5f5f5',
        borderRadius: '4px',
        marginTop: '10px'
      }}>
        /mockups/wwe-health/4/LoginScreen
      </code>

      <h2>Registered Projects</h2>
      <p>Use the MCP tool <code>mockup_list_projects</code> to see registered components.</p>
    </div>
  );
}
