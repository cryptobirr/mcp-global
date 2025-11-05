#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
const readline = require('readline');

// Configuration for different Google services
const SERVICES = {
  calendar: {
    scopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ],
    credentialsPath: process.env.GCAL_CREDENTIALS_PATH || '/Users/mekonen/Downloads/client_secret_680013798173-s2hff4r7c0holjbvqbjf1og7h346p3ev.apps.googleusercontent.com.json',
    tokenPaths: [
      '/Users/mekonen/Documents/Cline/MCP/google-calendar-mcp/secrets/calendar_token.json',
      '/Users/mekonen/Documents/Cline/MCP/new-google-calendar-mcp/secrets/calendar_token.json'
    ]
  },
  gmail: {
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ],
    credentialsPath: process.env.GMAIL_CREDENTIALS_PATH || '/Users/mekonen/Documents/Cline/MCP/gmail-mcp/credentials.json',
    tokenPaths: [
      '/Users/mekonen/Documents/Cline/MCP/gmail-mcp/token.json'
    ]
  },
  drive: {
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ],
    credentialsPath: process.env.GDRIVE_CREDENTIALS_PATH || '/Users/mekonen/Downloads/client_secret_680013798173-s2hff4r7c0holjbvqbjf1og7h346p3ev.apps.googleusercontent.com.json',
    tokenPaths: [
      '/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json'
    ]
  }
};

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to ensure directory exists
async function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  try {
    await fs.access(dirname);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(dirname, { recursive: true });
    console.log(`Created directory: ${dirname}`);
  }
}

// Function to save credentials to token file
async function saveCredentials(client, tokenPath) {
  await ensureDirectoryExists(tokenPath);
  
  const payload = {
    type: 'authorized_user',
    client_id: client._clientId,
    client_secret: client._clientSecret,
    refresh_token: client.credentials.refresh_token,
  };
  
  await fs.writeFile(tokenPath, JSON.stringify(payload, null, 2));
  console.log(`Token saved to: ${tokenPath}`);
}

// Function to manually authenticate with Google
async function manualAuthentication(credentialsPath, scopes) {
  try {
    // Read credentials file
    const content = await fs.readFile(credentialsPath);
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    // Create OAuth2 client
    const oAuth2Client = new google.auth.OAuth2(
      client_id, 
      client_secret, 
      redirect_uris[0] || 'http://localhost'
    );
    
    // Generate auth URL
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'  // Force to show consent screen to get refresh_token
    });
    
    console.log('Authorize this app by visiting this URL:', authUrl);
    console.log('\nAfter authorization, you will be redirected to a page that might show an error.');
    console.log('Copy the "code" parameter from the URL in your browser address bar.');
    
    const code = await prompt('Enter the code from that page here: ');
    
    // Exchange code for tokens
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    
    return oAuth2Client;
  } catch (error) {
    console.error('Error during manual authentication:', error);
    throw error;
  }
}

// Main function to authenticate and save tokens
async function authenticateService(service) {
  if (!SERVICES[service]) {
    console.error(`Unknown service: ${service}`);
    console.error(`Available services: ${Object.keys(SERVICES).join(', ')}`);
    process.exit(1);
  }

  const { scopes, credentialsPath, tokenPaths } = SERVICES[service];
  
  try {
    // Check if credentials file exists
    await fs.access(credentialsPath);
    console.log(`Using credentials file: ${credentialsPath}`);
  } catch (error) {
    console.error(`Credentials file not found: ${credentialsPath}`);
    console.error('Please ensure you have downloaded the OAuth credentials JSON file from Google Cloud Console');
    process.exit(1);
  }

  try {
    // First try the automatic authentication
    console.log(`Authenticating ${service} with scopes: ${scopes.join(', ')}`);
    console.log('A browser window will open. Please log in and grant the requested permissions.');
    
    let client;
    try {
      client = await authenticate({
        scopes,
        keyfilePath: credentialsPath,
      });
    } catch (authError) {
      console.error('Automatic authentication failed:', authError.message);
      console.log('\nTrying manual authentication instead...');
      client = await manualAuthentication(credentialsPath, scopes);
    }

    if (!client.credentials || !client.credentials.refresh_token) {
      console.error('Authentication completed but no refresh token was obtained.');
      console.error('This can happen if you previously authorized this application.');
      
      const answer = await prompt('Do you want to force a new token by revoking previous access? (yes/no): ');
      if (answer.toLowerCase() === 'yes') {
        console.log('Please go to https://myaccount.google.com/permissions and revoke access for the app.');
        console.log('Then run this script again.');
      }
      
      rl.close();
      process.exit(1);
    }

    // Save tokens to all configured paths
    for (const tokenPath of tokenPaths) {
      await saveCredentials(client, tokenPath);
    }

    console.log(`Successfully authenticated ${service} and saved tokens.`);
    return client;
  } catch (error) {
    console.error('Authentication error:', error);
    process.exit(1);
  }
}

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node google-auth.js [service]');
    console.log('Available services:');
    Object.keys(SERVICES).forEach(service => {
      console.log(`  - ${service}`);
    });
    console.log('Example: node google-auth.js calendar');
    
    const answer = await prompt('Which service would you like to authenticate? ');
    if (SERVICES[answer]) {
      await authenticateService(answer);
    } else {
      console.error(`Unknown service: ${answer}`);
    }
  } else {
    const service = args[0].toLowerCase();
    await authenticateService(service);
  }
  
  rl.close();
}

main().catch(console.error);