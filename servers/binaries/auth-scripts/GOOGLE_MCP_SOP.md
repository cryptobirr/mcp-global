# Google MCP Server Authentication SOP

This document provides a step-by-step guide for setting up, authenticating, and troubleshooting Google MCP servers (Calendar, Gmail, Drive).

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Authentication Process](#authentication-process)
4. [Service-Specific Instructions](#service-specific-instructions)
5. [Troubleshooting](#troubleshooting)
6. [MCP Server Configuration](#mcp-server-configuration)
7. [Usage Examples](#usage-examples)

## Overview

Google MCP servers use OAuth2 authentication to access Google APIs. The authentication process requires:
- OAuth credentials from Google Cloud Console
- A token file containing a refresh token
- Environment variables pointing to these files

When the "invalid_grant" error occurs, it means the OAuth tokens have expired or been revoked, and you need to re-authenticate.

## Prerequisites

1. **Google Cloud Console Project** with the appropriate APIs enabled:
   - Google Calendar API
   - Gmail API
   - Google Drive API

2. **OAuth Credentials** downloaded as JSON file:
   - Client ID
   - Client Secret
   - Redirect URIs (must include http://localhost)

3. **MCP Server Code** for each Google service

## Authentication Process

### Step 1: Set Up Authentication Scripts

1. Create a directory for authentication scripts:
   ```bash
   mkdir -p /Users/mekonen/Documents/Cline/MCP/auth-scripts
   ```

2. Create the manual authentication script (`manual-google-auth.js`):
   ```javascript
   #!/usr/bin/env node

   const fs = require('fs').promises;
   const path = require('path');
   const { google } = require('googleapis');
   const readline = require('readline');

   // Configuration for different Google services
   const SERVICES = {
     calendar: {
       scopes: [
         'https://www.googleapis.com/auth/calendar.events',
         'https://www.googleapis.com/auth/calendar.readonly'
       ],
       credentialsPath: process.env.GCAL_CREDENTIALS_PATH || '/path/to/credentials.json',
       tokenPaths: [
         '/path/to/calendar_token.json'
       ]
     },
     gmail: {
       scopes: [
         'https://www.googleapis.com/auth/gmail.readonly',
         'https://www.googleapis.com/auth/gmail.send',
         'https://www.googleapis.com/auth/gmail.modify'
       ],
       credentialsPath: process.env.GMAIL_CREDENTIALS_PATH || '/path/to/credentials.json',
       tokenPaths: [
         '/path/to/gmail_token.json'
       ]
     },
     drive: {
       scopes: [
         'https://www.googleapis.com/auth/drive.readonly',
         'https://www.googleapis.com/auth/drive.file',
         'https://www.googleapis.com/auth/drive.metadata.readonly'
       ],
       credentialsPath: process.env.GDRIVE_CREDENTIALS_PATH || '/path/to/credentials.json',
       tokenPaths: [
         '/path/to/drive_token.json'
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
   async function authenticateWithGoogle(credentialsPath, scopes) {
     try {
       // Read credentials file
       const content = await fs.readFile(credentialsPath);
       const credentials = JSON.parse(content);
       
       // Get client details from credentials file
       const { client_secret, client_id } = credentials.installed || credentials.web;
       
       // Create OAuth2 client with a fixed redirect URI
       const redirectUri = 'http://localhost';
       const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
       
       // Generate auth URL
       const authUrl = oAuth2Client.generateAuthUrl({
         access_type: 'offline',
         scope: scopes,
         prompt: 'consent'  // Force to show consent screen to get refresh_token
       });
       
       console.log('Authorize this app by visiting this URL:');
       console.log('\n' + authUrl + '\n');
       console.log('After authorization, you will be redirected to a page that might show an error.');
       console.log('Copy the "code" parameter from the URL in your browser address bar.');
       console.log('The URL will look like: http://localhost/?code=4/XXXX...');
       
       const code = await prompt('\nEnter the code from that page here: ');
       
       // Exchange code for tokens
       const { tokens } = await oAuth2Client.getToken(code);
       
       if (!tokens.refresh_token) {
         throw new Error('No refresh token received. You may need to revoke access for this application in your Google account.');
       }
       
       oAuth2Client.setCredentials(tokens);
       return oAuth2Client;
     } catch (error) {
       console.error('Error during authentication:', error);
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
       console.log(`Authenticating ${service} with scopes: ${scopes.join(', ')}`);
       
       // Use our manual authentication function
       const client = await authenticateWithGoogle(credentialsPath, scopes);

       // Save tokens to all configured paths
       for (const tokenPath of tokenPaths) {
         await saveCredentials(client, tokenPath);
       }

       console.log(`Successfully authenticated ${service} and saved tokens.`);
       return client;
     } catch (error) {
       console.error('Authentication error:', error);
       
       if (error.message.includes('No refresh token received')) {
         console.log('\nTo fix this issue:');
         console.log('1. Go to https://myaccount.google.com/permissions');
         console.log('2. Find and remove access for the application');
         console.log('3. Run this script again');
       }
       
       process.exit(1);
     }
   }

   // Parse command line arguments
   async function main() {
     const args = process.argv.slice(2);
     
     if (args.length === 0) {
       console.log('Usage: node manual-google-auth.js [service]');
       console.log('Available services:');
       Object.keys(SERVICES).forEach(service => {
         console.log(`  - ${service}`);
       });
       console.log('Example: node manual-google-auth.js calendar');
       
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
   ```

3. Create a package.json file:
   ```json
   {
     "name": "google-auth-scripts",
     "version": "1.0.0",
     "description": "Scripts to authenticate Google APIs for MCP servers",
     "main": "manual-google-auth.js",
     "scripts": {
       "manual:calendar": "node manual-google-auth.js calendar",
       "manual:gmail": "node manual-google-auth.js gmail",
       "manual:drive": "node manual-google-auth.js drive"
     },
     "dependencies": {
       "googleapis": "^105.0.0"
     }
   }
   ```

4. Make the script executable:
   ```bash
   chmod +x /Users/mekonen/Documents/Cline/MCP/auth-scripts/manual-google-auth.js
   ```

5. Install dependencies:
   ```bash
   cd /Users/mekonen/Documents/Cline/MCP/auth-scripts && npm install
   ```

### Step 2: Update Paths in the Script

1. Update the `credentialsPath` and `tokenPaths` in the `SERVICES` object to point to your actual files:

   ```javascript
   calendar: {
     // ...
     credentialsPath: '/Users/mekonen/Downloads/client_secret_XXXXX.apps.googleusercontent.com.json',
     tokenPaths: [
       '/Users/mekonen/Documents/Cline/MCP/google-calendar-mcp/secrets/calendar_token.json'
     ]
   },
   gmail: {
     // ...
     credentialsPath: '/Users/mekonen/Documents/Cline/MCP/gmail-mcp/credentials.json',
     tokenPaths: [
       '/Users/mekonen/Documents/Cline/MCP/gmail-mcp/token.json'
     ]
   },
   drive: {
     // ...
     credentialsPath: '/Users/mekonen/Downloads/client_secret_XXXXX.apps.googleusercontent.com.json',
     tokenPaths: [
       '/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json'
     ]
   }
   ```

## Service-Specific Instructions

### Google Calendar

1. Authentication using the manual script:
   ```bash
   cd /Users/mekonen/Documents/Cline/MCP/auth-scripts && npm run manual:calendar
   ```

2. Token format:
   ```json
   {
     "type": "authorized_user",
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "client_secret": "YOUR_CLIENT_SECRET",
     "refresh_token": "YOUR_REFRESH_TOKEN"
   }
   ```

3. Token location:
   - `/Users/mekonen/Documents/Cline/MCP/google-calendar-mcp/secrets/calendar_token.json`

### Gmail

1. Authentication using the manual script:
   ```bash
   cd /Users/mekonen/Documents/Cline/MCP/auth-scripts && npm run manual:gmail
   ```

2. Token format:
   ```json
   {
     "type": "authorized_user",
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "client_secret": "YOUR_CLIENT_SECRET",
     "refresh_token": "YOUR_REFRESH_TOKEN"
   }
   ```

3. Token location:
   - `/Users/mekonen/Documents/Cline/MCP/gmail-mcp/token.json`

### Google Drive

1. Google Drive has a dedicated authentication script:
   ```bash
   cd /Users/mekonen/Documents/Cline/MCP/google-drive-mcp
   GDRIVE_CREDENTIALS_PATH="/Users/mekonen/Downloads/client_secret_XXXXX.apps.googleusercontent.com.json" GDRIVE_TOKEN_PATH="/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json" node get-drive-token.js
   ```

2. Token format (required fields):
   ```json
   {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "client_secret": "YOUR_CLIENT_SECRET",
     "refresh_token": "YOUR_REFRESH_TOKEN"
   }
   ```

3. Token location:
   - `/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json`

## Troubleshooting

### "invalid_grant" Error

If you see an "invalid_grant" error when using the MCP servers, it means the OAuth tokens have expired or been revoked. To fix this:

1. Re-run the authentication script for the affected service:
   ```bash
   cd /Users/mekonen/Documents/Cline/MCP/auth-scripts && npm run manual:calendar
   ```

2. For Google Drive, use the dedicated script:
   ```bash
   cd /Users/mekonen/Documents/Cline/MCP/google-drive-mcp
   GDRIVE_CREDENTIALS_PATH="/Users/mekonen/Downloads/client_secret_XXXXX.apps.googleusercontent.com.json" GDRIVE_TOKEN_PATH="/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json" node get-drive-token.js
   ```

3. If you still get "No refresh token received" error:
   - Go to https://myaccount.google.com/permissions
   - Find and remove access for the application
   - Run the authentication script again

### "redirect_uri_mismatch" Error

If you see a "redirect_uri_mismatch" error during authentication:

1. Go to the Google Cloud Console
2. Navigate to "APIs & Services" > "Credentials"
3. Edit your OAuth client
4. Add "http://localhost" to the list of authorized redirect URIs
5. Save the changes
6. Try the authentication process again

### Token Format Issues

Each Google service expects a specific token format:

1. **Calendar and Gmail**:
   ```json
   {
     "type": "authorized_user",
     "client_id": "...",
     "client_secret": "...",
     "refresh_token": "..."
   }
   ```

2. **Drive**:
   ```json
   {
     "client_id": "...",
     "client_secret": "...",
     "refresh_token": "..."
   }
   ```

If you're having issues, ensure the token file has the correct format for the specific service.

## MCP Server Configuration

The MCP server configuration in `cline_mcp_settings.json` should look like this:

```json
{
  "mcpServers": {
    "gcal_mekonen_main": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "command": "node",
      "args": [
        "/Users/mekonen/Documents/Cline/MCP/google-calendar-mcp/build/index.js"
      ],
      "env": {
        "GCAL_CREDENTIALS_PATH": "/path/to/credentials.json",
        "GCAL_TOKEN_PATH": "/path/to/calendar_token.json"
      },
      "transportType": "stdio"
    },
    "gmail_mekonen_main": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "command": "node",
      "args": [
        "/Users/mekonen/Documents/Cline/MCP/gmail-mcp/build/index.js"
      ],
      "env": {
        "GMAIL_CREDENTIALS_PATH": "/path/to/credentials.json",
        "GMAIL_TOKEN_PATH": "/path/to/token.json"
      },
      "transportType": "stdio"
    },
    "google-drive-mcp": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "command": "node",
      "args": [
        "/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/build/index.js"
      ],
      "env": {
        "GDRIVE_CREDENTIALS_PATH": "/path/to/credentials.json",
        "GDRIVE_TOKEN_PATH": "/path/to/drive_token.json"
      },
      "transportType": "stdio"
    }
  }
}
```

## Usage Examples

### Google Calendar

```javascript
<use_mcp_tool>
<server_name>gcal_mekonen_main</server_name>
<tool_name>list_calendars</tool_name>
<arguments>
{}
</arguments>
</use_mcp_tool>
```

### Gmail

```javascript
<use_mcp_tool>
<server_name>gmail_mekonen_main</server_name>
<tool_name>list_labels</tool_name>
<arguments>
{}
</arguments>
</use_mcp_tool>
```

### Google Drive

```javascript
<use_mcp_tool>
<server_name>google-drive-mcp</server_name>
<tool_name>list_files</tool_name>
<arguments>
{
  "folderId": "root",
  "pageSize": 10
}
</arguments>
</use_mcp_tool>