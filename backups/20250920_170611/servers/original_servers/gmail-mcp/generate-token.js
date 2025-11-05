import fs from 'fs';
import {google} from 'googleapis';

const CREDENTIALS_PATH = './credentials.json';
const TOKEN_PATH = './token.json';

// Load client secrets
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const {client_secret, client_id} = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id, client_secret, 'http://localhost:8080');

// Use the authorization code you provided
const code = '4/0AUJR-x5OJbF9e1cBiiaxccNs190Slx-3lucdGT5LMGg1iP5pvnfi7cJKraUDb1qfrmnH2g';

oAuth2Client.getToken(code, (err, token) => {
  if (err) {
    console.error('Error retrieving access token:', err);
    return;
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to', TOKEN_PATH);
  console.log('Token generated successfully!');
});