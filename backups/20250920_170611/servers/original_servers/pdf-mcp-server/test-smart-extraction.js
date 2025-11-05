#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Test PDFs - mix of text-based and potentially image-based
const testPDFs = [
  {
    name: "Domaine Business Proposal (Text-based)",
    path: "/Users/mekonen/Library/Mobile Documents/com~apple~CloudDocs/Projects/nenokem-professional/inbox/extracted/Domaine/Domaine/Additional Documents/Rodan   Fields Shopify Implementation   Domaine Overview   Proposal.pdf"
  },
  {
    name: "Anatta Technical Diagram (Image-based)",
    path: "/Users/mekonen/Library/Mobile Documents/com~apple~CloudDocs/Projects/nenokem-professional/inbox/extracted/Anatta/Anatta/Additional Documents/Rodan + Fields.pdf"
  },
  {
    name: "GSPANN RFP Response",
    path: "/Users/mekonen/Library/Mobile Documents/com~apple~CloudDocs/Projects/nenokem-professional/inbox/extracted/GSPANN/GSPANN/Additional Documents/Gspann R+F Shopify Rfp Response.pdf"
  }
];

async function testSmartExtraction(testPdf) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Testing: ${testPdf.name}`);
    console.log(`📄 File: ${testPdf.path}`);
    console.log('=' .repeat(80));

    const server = spawn('node', ['build/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let responseData = '';
    let hasError = false;

    server.stdout.on('data', (data) => {
      responseData += data.toString();
    });

    server.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
      hasError = true;
    });

    // Send initialization request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'smart-test-client', version: '1.0.0' }
      }
    };

    server.stdin.write(JSON.stringify(initRequest) + '\n');

    // Send tools list request
    setTimeout(() => {
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };
      server.stdin.write(JSON.stringify(toolsRequest) + '\n');
    }, 100);

    // Send smart extraction request
    setTimeout(() => {
      const extractRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'extract_pdf_text_smart',
          arguments: {
            file_path: testPdf.path
          }
        }
      };
      server.stdin.write(JSON.stringify(extractRequest) + '\n');
    }, 200);

    // Close server after processing
    setTimeout(() => {
      server.kill();
      
      if (hasError) {
        console.log('❌ Test failed due to server error');
        resolve({ success: false, error: 'Server error' });
        return;
      }

      try {
        // Parse and analyze the responses
        const responses = responseData.trim().split('\n').filter(line => line.trim());
        const extractionResponse = responses.find(response => {
          try {
            const parsed = JSON.parse(response);
            return parsed.id === 3;
          } catch (e) {
            return false;
          }
        });

        if (extractionResponse) {
          const parsed = JSON.parse(extractionResponse);
          
          if (parsed.result && parsed.result.content && parsed.result.content[0]) {
            const text = parsed.result.content[0].text;
            
            // Extract analysis information
            const analysisMatch = text.match(/Analysis: ([^\n]+)/);
            const pdfTypeMatch = text.match(/PDF Type: ([^\n]+)/);
            const confidenceMatch = text.match(/Confidence: ([^\n]+)/);
            const methodMatch = text.match(/Smart extraction using ([^:]+):/);
            
            const analysis = analysisMatch ? analysisMatch[1] : 'Unknown';
            const pdfType = pdfTypeMatch ? pdfTypeMatch[1] : 'Unknown';
            const confidence = confidenceMatch ? confidenceMatch[1] : 'Unknown';
            const method = methodMatch ? methodMatch[1] : 'Unknown';
            
            // Extract actual content (after the metadata)
            const contentStart = text.indexOf('\n\n') + 2;
            const actualContent = contentStart > 1 ? text.substring(contentStart) : text;
            const contentLength = actualContent.trim().length;
            
            console.log(`✅ Smart Extraction Successful!`);
            console.log(`📊 Analysis: ${analysis}`);
            console.log(`📋 PDF Type: ${pdfType}`);
            console.log(`🎯 Confidence: ${confidence}`);
            console.log(`⚙️  Method Used: ${method}`);
            console.log(`📏 Content Length: ${contentLength} characters`);
            
            if (contentLength > 100) {
              console.log(`📝 Content Preview (first 200 chars):`);
              console.log(`"${actualContent.substring(0, 200)}..."`);
            }
            
            resolve({
              success: true,
              analysis,
              pdfType,
              confidence,
              method,
              contentLength,
              preview: actualContent.substring(0, 200)
            });
          } else {
            console.log('❌ No content extracted');
            resolve({ success: false, error: 'No content' });
          }
        } else {
          console.log('❌ No extraction response received');
          resolve({ success: false, error: 'No response' });
        }
      } catch (error) {
        console.log('❌ Error parsing response:', error.message);
        resolve({ success: false, error: error.message });
      }
    }, 8000); // Increased timeout for OCR processing
  });
}

async function runAllTests() {
  console.log('🚀 Starting Smart PDF Extraction Tests');
  console.log('🎯 Testing intelligent PDF analysis and optimal method selection');
  console.log('=' .repeat(80));

  const results = [];

  for (const testPdf of testPDFs) {
    const result = await testSmartExtraction(testPdf);
    results.push({ name: testPdf.name, ...result });
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '=' .repeat(80));
  console.log('📊 SMART EXTRACTION TEST SUMMARY');
  console.log('=' .repeat(80));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful extractions: ${successful.length}/${results.length}`);
  console.log(`❌ Failed extractions: ${failed.length}/${results.length}`);

  if (successful.length > 0) {
    console.log('\n🎯 Method Selection Analysis:');
    const methodCounts = {};
    successful.forEach(r => {
      methodCounts[r.method] = (methodCounts[r.method] || 0) + 1;
    });
    
    Object.entries(methodCounts).forEach(([method, count]) => {
      console.log(`   ${method}: ${count} documents`);
    });

    console.log('\n📋 PDF Type Detection:');
    const typeCounts = {};
    successful.forEach(r => {
      typeCounts[r.pdfType] = (typeCounts[r.pdfType] || 0) + 1;
    });
    
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} documents`);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach(r => {
      console.log(`   ${r.name}: ${r.error}`);
    });
  }

  console.log('\n🎉 Smart extraction testing complete!');
  console.log('💡 The PDF MCP server now intelligently selects optimal extraction methods');
  console.log('🔧 Supports text-based, image-based, and hybrid PDF documents');
}

// Run the tests
runAllTests().catch(console.error);