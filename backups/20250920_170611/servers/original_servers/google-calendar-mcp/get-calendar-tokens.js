// get-calendar-tokens.js
// This script performs the one-time OAuth2 flow to get a refresh token for Google Calendar API access.
// Run this script manually from your terminal: node get-calendar-tokens.js <path_to_credentials.json> <path_to_save_token.json>

import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

async function runAuthFlow(credentialsPath, tokenPath) {
  console.log('Starting Google Calendar authentication flow...');
  console.log(`Using credentials file: ${credentialsPath}`);
  console.log(`Will save token to: ${tokenPath}`);

  try {
    // Ensure credentials path exists
    await fs.access(credentialsPath);
  } catch (error) {
    console.error(`Error: Credentials file not found at ${credentialsPath}`);
    console.error('Please provide a valid path to the credentials.json file downloaded from Google Cloud Console.');
    process.exit(1);
  }

  try {
    const client = await authenticate({
      scopes: SCOPES,
      keyfilePath: credentialsPath,
    });

    if (client.credentials && client.credentials.refresh_token) {
      console.log('Authentication successful! Refresh token obtained.');

      // Read client ID and secret from credentials to store alongside the refresh token
      const credContent = await fs.readFile(credentialsPath);
      const keys = JSON.parse(credContent.toString());
      const key = keys.installed || keys.web;

      if (!key || !key.client_id || !key.client_secret) {
          console.error('Could not extract client_id and client_secret from credentials file.');
          process.exit(1);
      }

      const tokenPayload = {
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
        // Optionally add access_token, expiry_date if needed, though refresh_token is key
      };

      // Ensure the directory for the token path exists
      const tokenDir = path.dirname(tokenPath);
      try {
          await fs.mkdir(tokenDir, { recursive: true });
      } catch (mkdirError) {
          // Ignore if directory already exists
          if (mkdirError.code !== 'EEXIST') {
              throw mkdirError;
          }
      }


      await fs.writeFile(tokenPath, JSON.stringify(tokenPayload, null, 2));
      console.log(`Token data saved successfully to ${tokenPath}`);
      console.log('You can now configure the MCP server to use these files.');

    } else {
      console.error('Authentication completed, but no refresh token was obtained.');
      console.error('This might happen if you have previously authorized and not revoked access, or if the consent screen setup is incorrect.');
      console.error('Try revoking access for the app here: https://myaccount.google.com/permissions');
      process.exit(1);
    }
  } catch (error) {
    console.error('Authentication failed:', error);
    process.exit(1);
  }
}

// Get paths from command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node get-calendar-tokens.js <path_to_credentials.json> <path_to_save_token.json>');
  process.exit(1);
}

const [credentialsPathArg, tokenPathArg] = args;
runAuthFlow(credentialsPathArg, tokenPathArg);
