import fs from 'fs';
import path from 'path';
import {google} from 'googleapis';
import {createInterface} from 'readline';

const CREDENTIALS_PATH = new URL('credentials.json', import.meta.url).pathname;
const TOKEN_PATH = new URL('token.json', import.meta.url).pathname;

// Load client secrets
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const {client_secret, client_id} = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id, client_secret, 'http://localhost:8080'); // Changed port

// Generate auth URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/gmail.modify'
  ],
});

console.log('Authorize this app by visiting this URL:', authUrl);

// After authorization, paste the code here
const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.question('Enter the code from that page here: ', (code) => {
  readline.close();
  // Decode the URL-encoded code pasted from the browser
  const decodedCode = decodeURIComponent(code);
  oAuth2Client.getToken(decodedCode, (err, token) => {
    if (err) return console.error('Error retrieving access token', err);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to', TOKEN_PATH);
  });
});
