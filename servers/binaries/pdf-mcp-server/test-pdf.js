const { spawn } = require('child_process');
const path = require('path');

// Test the PDF MCP server with a problematic PDF
async function testPDFExtraction() {
  const serverPath = path.join(__dirname, 'build', 'index.js');
  const testPDFPath = '/Users/mekonen/Library/Mobile Documents/com~apple~CloudDocs/Projects/nenokem-professional/inbox/extracted/Domaine/Domaine/Additional Documents/Rodan   Fields Shopify Implementation   Domaine Overview   Proposal.pdf';
  
  console.log('Starting PDF MCP Server test...');
  console.log('Test PDF:', testPDFPath);
  
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let responseData = '';
  
  server.stdout.on('data', (data) => {
    responseData += data.toString();
    console.log('Server response:', data.toString());
  });
  
  server.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });
  
  // Send initialization request
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  };
  
  server.stdin.write(JSON.stringify(initRequest) + '\n');
  
  // Wait a bit for initialization
  setTimeout(() => {
    // Send list tools request
    const listToolsRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    };
    
    server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
    
    // Wait a bit then send extract request
    setTimeout(() => {
      const extractRequest = {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "extract_pdf_text",
          arguments: {
            file_path: testPDFPath,
            methods: ["pdf-parse"],
            try_all_methods: false
          }
        }
      };
      
      server.stdin.write(JSON.stringify(extractRequest) + '\n');
      
      // Close after a delay
      setTimeout(() => {
        server.kill();
      }, 5000);
    }, 1000);
  }, 1000);
  
  server.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    console.log('Full response data:', responseData);
  });
}

testPDFExtraction().catch(console.error);