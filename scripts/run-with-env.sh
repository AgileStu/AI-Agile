#!/bin/bash
# Wrapper script to run any command with decrypted .env
# Usage: ./scripts/run-with-env.sh <command>
# Examples:
#   ./scripts/run-with-env.sh npm run sharepoint
#   ./scripts/run-with-env.sh node services/list-sharepoint-sites.js

# Fetch DOTENV_PRIVATE_KEY from Windows Credential Manager
DOTENV_PRIVATE_KEY=$(/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -ExecutionPolicy Bypass -Command "Import-Module CredentialManager; \$cred = Get-StoredCredential -Target 'DOTENVX_PRIVATE_KEY'; Write-Output \$cred.GetNetworkCredential().Password" | tr -d '\r')

if [ -z "$DOTENV_PRIVATE_KEY" ]; then
    echo "Error: DOTENVX_PRIVATE_KEY not found in Credential Manager"
    exit 1
fi

export DOTENV_PRIVATE_KEY

# If no arguments, just export the key (for sourcing)
if [ $# -eq 0 ]; then
    echo "DOTENV_PRIVATE_KEY exported. Run your commands now."
    exec $SHELL
fi

# Run the command
exec "$@"
