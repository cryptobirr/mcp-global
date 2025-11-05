#!/bin/bash

export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='dev-token'

DB_PATH="${1:-secret/postgres/birrbot_live}"

CREDS=$(vault kv get -format=json "$DB_PATH" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "Error: Failed to retrieve credentials from Vault at path: $DB_PATH" >&2
    exit 1
fi

DB_HOST=$(echo "$CREDS" | jq -r '.data.data.host')
DB_PORT=$(echo "$CREDS" | jq -r '.data.data.port')
DB_NAME=$(echo "$CREDS" | jq -r '.data.data.database')
DB_USER=$(echo "$CREDS" | jq -r '.data.data.username')
DB_PASS=$(echo "$CREDS" | jq -r '.data.data.password')

CONNECTION_STRING="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

exec npx -y @modelcontextprotocol/server-postgres "$CONNECTION_STRING"
