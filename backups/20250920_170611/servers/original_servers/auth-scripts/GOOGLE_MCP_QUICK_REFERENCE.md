# Google MCP Authentication Quick Reference

## When to Use This Guide

Use this guide when:
- You see "invalid_grant" errors from Google MCP servers
- You need to set up Google MCP servers for the first time
- You need to refresh OAuth tokens

## Quick Steps to Fix Authentication Issues

### 1. Check if Authentication Scripts Exist

```bash
ls -la /Users/mekonen/Documents/Cline/MCP/auth-scripts
```

If they don't exist, create them following the detailed SOP.

### 2. Run Authentication for the Affected Service

#### For Google Calendar and Gmail

```bash
# For Google Calendar
cd /Users/mekonen/Documents/Cline/MCP/auth-scripts && npm run manual:calendar

# For Gmail
cd /Users/mekonen/Documents/Cline/MCP/auth-scripts && npm run manual:gmail
```

#### For Google Drive (Special Case)

Google Drive has its own dedicated authentication script:

```bash
cd /Users/mekonen/Documents/Cline/MCP/google-drive-mcp
GDRIVE_CREDENTIALS_PATH="/Users/mekonen/Downloads/client_secret_XXXXX.apps.googleusercontent.com.json" GDRIVE_TOKEN_PATH="/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json" node get-drive-token.js
```

### 3. Follow the Browser Authentication Flow

1. Open the URL provided in the terminal
2. Sign in with your Google account
3. Grant the requested permissions
4. You'll be redirected to a page showing "This site can't be reached" - THIS IS EXPECTED
5. Copy the "code" parameter from the URL in your browser's address bar
6. Paste this code into the terminal when prompted

### 4. Verify Token Creation

```bash
# For Google Calendar
ls -la /Users/mekonen/Documents/Cline/MCP/google-calendar-mcp/secrets/calendar_token.json

# For Gmail
ls -la /Users/mekonen/Documents/Cline/MCP/gmail-mcp/token.json

# For Google Drive
ls -la /Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json
```

### 5. Check Token Format

Each service requires a specific token format:

#### Calendar and Gmail
```json
{
  "type": "authorized_user",
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "YOUR_REFRESH_TOKEN"
}
```

#### Google Drive
```json
{
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "YOUR_REFRESH_TOKEN"
}
```

### 6. Test the MCP Server

```javascript
// For Google Calendar
<use_mcp_tool>
<server_name>gcal_mekonen_main</server_name>
<tool_name>list_calendars</tool_name>
<arguments>
{}
</arguments>
</use_mcp_tool>

// For Gmail
<use_mcp_tool>
<server_name>gmail_mekonen_main</server_name>
<tool_name>list_labels</tool_name>
<arguments>
{}
</arguments>
</use_mcp_tool>

// For Google Drive
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
```

## Common Issues and Solutions

### No Refresh Token Received

If you get "No refresh token received" error:

1. Go to https://myaccount.google.com/permissions
2. Find and remove access for the application
3. Run the authentication script again

### Redirect URI Mismatch

If you get "redirect_uri_mismatch" error:

1. Go to Google Cloud Console > APIs & Services > Credentials
2. Edit your OAuth client
3. Add "http://localhost" to authorized redirect URIs
4. Save and try again

### Invalid Grant Error

If you get "invalid_grant" error after authentication:

1. The refresh token might be expired or revoked
2. Re-run the authentication process for the affected service
3. Ensure the token file has the correct format for the specific service

## File Locations

- **Authentication Scripts**: `/Users/mekonen/Documents/Cline/MCP/auth-scripts/`
- **Calendar Token**: `/Users/mekonen/Documents/Cline/MCP/google-calendar-mcp/secrets/calendar_token.json`
- **Gmail Token**: `/Users/mekonen/Documents/Cline/MCP/gmail-mcp/token.json`
- **Drive Token**: `/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/secrets/drive_token.json`
- **Drive Auth Script**: `/Users/mekonen/Documents/Cline/MCP/google-drive-mcp/get-drive-token.js`
- **MCP Settings**: `../../../../Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

For more detailed instructions, see the full SOP document: `GOOGLE_MCP_SOP.md`