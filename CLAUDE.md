# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-Agile is an AI development framework for integrating with business services (Atera, M365, Huntress, Dynamics 365, Cyber Secure, DropSuite, Usecure, Xero).

## Commands

```bash
npm install                # Install dependencies
npm run sharepoint         # List SharePoint sites via MS Graph API

npx dotenvx decrypt        # Decrypt .env for editing
npx dotenvx encrypt        # Re-encrypt .env after editing
```

## Architecture

```
AI-Agile/
├── .env                 # Encrypted environment variables
├── .env.keys            # Private key (DO NOT COMMIT)
├── .gitignore
├── package.json
├── scripts/
│   ├── get-env-key.ps1  # Fetch key from Credential Manager (optional)
│   └── run-with-env.sh  # Run commands with decrypted env (optional)
└── services/
    └── list-sharepoint-sites.js
```

## Environment & Secrets

- **Encrypted .env**: Uses dotenvx. Safe to commit.
- **.env.keys**: Contains `DOTENV_PRIVATE_KEY`. Never commit (in .gitignore).
- **Running services**: Use `npm run <script>` which calls `dotenvx run` to decrypt automatically.

## Azure App Registration

- **App Name**: AI Access Registration
- **App ID**: 8ea08429-3b94-4545-a1e1-dcebd191d69a
- **Tenant ID**: 861e0704-d666-492c-9d71-ad5689c392e3

### MS Graph API Permissions (Application)

| Permission | Description |
|------------|-------------|
| Application.Read.All | Read all applications |
| Group.Read.All | Read all groups |
| GroupMember.Read.All | Read all group memberships |
| LicenseAssignment.Read.All | Read all license assignments |
| Organization.Read.All | Read organization information |
| Reports.Read.All | Read all usage reports |
| Sites.Read.All | Read items in all site collections |
| User.Read.All | Read all users' full profiles |

## MS Graph API

Services use `@azure/identity` and `@microsoft/microsoft-graph-client`. Required env vars:
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`

## Adding New Services

1. Create file in `services/` folder
2. Add npm script in `package.json`:
   ```json
   "scriptname": "dotenvx run -- node services/your-service.js"
   ```
3. Run with `npm run scriptname`

## Azure CLI

Azure CLI is installed. Use via PowerShell from WSL:
```bash
powershell.exe -Command "& 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd' <command>"
```

Example - check app permissions:
```bash
powershell.exe -Command "& 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd' ad app permission list --id 8ea08429-3b94-4545-a1e1-dcebd191d69a"
```
