#!/bin/bash

export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='dev-token'

VAULT_PATH="${1:-secret/ynab/credentials}"

CREDS=$(vault kv get -format=json "$VAULT_PATH" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "Error: Failed to retrieve credentials from Vault at path: $VAULT_PATH" >&2
    exit 1
fi

YNAB_API_KEY=$(echo "$CREDS" | jq -r '.data.data.api_key')

if [ -z "$YNAB_API_KEY" ] || [ "$YNAB_API_KEY" = "null" ]; then
    echo "Error: YNAB API key not found in Vault" >&2
    exit 1
fi

export YNAB_API_TOKEN="$YNAB_API_KEY"

exec npx -y ynab-mcp-server
