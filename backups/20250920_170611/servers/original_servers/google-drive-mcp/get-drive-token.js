import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

// Load client secrets from a local file specified by env var.
const CREDENTIALS_PATH = process.env.GDRIVE_CREDENTIALS_PATH;
const TOKEN_PATH = process.env.GDRIVE_TOKEN_PATH;

if (!CREDENTIALS_PATH || !TOKEN_PATH) {
  console.error('Error: GDRIVE_CREDENTIALS_PATH and GDRIVE_TOKEN_PATH environment variables must be set.');
  console.error('Please ensure the google-drive-mcp server is configured correctly in your MCP settings.');
  process.exit(1);
}

// Define the required scope for Google Drive access
// https://developers.google.com/identity/protocols/oauth2/scopes#drive
const SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<object|null>} // Return type changed to generic object
 */
async function loadSavedCredentialsIfExist() {
  try {
    // Removed assertion ! - rely on the check at the top
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    const credentials = JSON.parse(content);
     // Ensure essential fields are present (added check)
    if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
        console.error(`Token file ${TOKEN_PATH} is missing required fields (client_id, client_secret, refresh_token).`);
        return null;
    }
    // Removed type assertion
    return google.auth.fromJSON(credentials);
  } catch (err) {
    // If token file doesn't exist or is invalid, return null
    // Removed type annotation : any
    if (err.code === 'ENOENT') {
      console.log('Token file not found. Proceeding with authorization.');
    } else {
      console.error(`Error loading token file from ${TOKEN_PATH}:`, err);
    }
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {object} client // Parameter type changed to generic object
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  // Removed assertions ! - rely on the check at the top
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web; // Handle both desktop and web app credentials format

    if (!client.credentials.refresh_token) {
       console.warn('Warning: No refresh token found. You might need to re-authorize periodically.');
       // Attempting to authorize again might help if the consent screen wasn't configured correctly
       // or if the user didn't grant offline access.
    }

    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
      // Include access token and expiry for immediate use, though refresh token is key
      access_token: client.credentials.access_token,
      expiry_date: client.credentials.expiry_date,
    });

    // Ensure the directory exists
    // Removed assertion !
    const tokenDir = path.dirname(TOKEN_PATH);
    try {
        await fs.mkdir(tokenDir, { recursive: true });
        console.log(`Ensured directory exists: ${tokenDir}`);
    } catch (mkdirErr) {
        // Ignore EEXIST error (directory already exists), re-throw others
        // Removed type annotation : any
        if (mkdirErr.code !== 'EEXIST') {
            throw mkdirErr;
        }
    }
    // Removed assertion !
    await fs.writeFile(TOKEN_PATH, payload);
    console.log(`Token saved successfully to ${TOKEN_PATH}`);
  } catch (err) {
      // Removed type annotation : any
      console.error(`Error saving token to ${TOKEN_PATH}:`, err);
      throw new Error(`Failed to save credentials: ${err.message}`); // Re-throw for main function catch
  }
}


/**
 * Load or request or authorization to call APIs.
 * Will prompt the user for authorization via browser.
 */
// Removed return type annotation
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    console.log('Existing credentials loaded successfully.');
     if (client) return client; // Return if still valid after potential refresh check
  }

  // If no valid client loaded, start the authentication flow
  console.log('Starting authentication flow...');
  try {
      client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH, // CREDENTIALS_PATH is checked at the top
      });

      if (client && client.credentials) {
        console.log('Authentication successful. Saving credentials...');
        await saveCredentials(client);
        return client;
      } else {
         throw new Error('Authentication failed: No credentials obtained.');
      }
  } catch (authErr) {
       // Removed type annotation : any
       console.error('Authentication process failed:', authErr);
       // Provide more specific guidance if possible
       if (authErr.message.includes('invalid_grant')) {
           console.error('Hint: The authorization code might be invalid or expired, or there might be an issue with the refresh token. Try deleting the token file and running again.');
       } else if (authErr.message.includes('redirect_uri_mismatch')) {
           console.error('Hint: Ensure the redirect URIs configured in your Google Cloud Console OAuth client match what the authentication library expects (often http://localhost:port).');
       }
       throw authErr; // Re-throw to be caught by the main catch block
  }
}

// Main execution
authorize()
  .then(client => {
    console.log('Authorization complete. Token stored at:', TOKEN_PATH);
    console.log('You can now start the google-drive-mcp server.');
    // Optionally, make a test API call here
    // const drive = google.drive({version: 'v3', auth: client});
    // drive.files.list(...)
  })
  .catch(err => {
      console.error('Failed to complete authorization:', err);
      process.exit(1); // Exit with error code
  });
