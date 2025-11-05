# Google API Authentication for MCP Servers

This directory contains scripts to authenticate with Google APIs and generate new OAuth tokens for MCP servers.

## Background

The Google MCP servers (Calendar, Gmail, Drive) use OAuth2 authentication with refresh tokens. These tokens can expire or be revoked, resulting in "invalid_grant" errors when trying to use the MCP servers.

## Authentication Script

The `google-auth.js` script handles the OAuth authentication flow for all Google services. It will:

1. Open a browser window for you to log in to your Google account
2. Request the necessary permissions for the selected service
3. Generate new OAuth tokens and save them to the appropriate locations

## Usage

You can authenticate each service individually or all at once:

### Authenticate Google Calendar

```bash
npm run auth:calendar
```

### Authenticate Gmail

```bash
npm run auth:gmail
```

### Authenticate Google Drive

```bash
npm run auth:drive
```

### Authenticate All Services

```bash
npm run auth:all
```

## Troubleshooting

If you encounter issues during authentication:

1. **No refresh token obtained**: This can happen if you previously authorized the application. The script will prompt you to revoke access. Go to [Google Account Permissions](https://myaccount.google.com/permissions) and revoke access for the app, then run the script again.

2. **Invalid credentials file**: Ensure that you have the correct OAuth credentials JSON file from Google Cloud Console.

3. **Directory not found**: The script will automatically create any necessary directories for token files.

## Token Locations

The script will save tokens to the following locations:

- **Calendar**: 
  - `/Users/mekonen/Documents/Cline/MCP/google-calendar-mcp/secrets/calendar_token.json`
  - `/Users/mekonen/Documents/Cline/MCP/new-google-calendar-mcp/secrets/calendar_token.json`

- **Gmail**: 
  - `/Users/mekonen/Documents/Cline/MCP/gmail-mcp/token.json`

- **Drive**: 
  - `/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json`