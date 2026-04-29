# AI-Agile

AI development framework for integrating with business services.
Git Tested
Stuart tested



## Quick Start

```bash
npm install
npm run sharepoint    # List SharePoint sites
npm run huntress      # Huntress EDR report
npm run atera         # Atera RMM report
npm run dropsuite     # Dropsuite backup report
npm run cybersecure   # ConnectSecure vulnerability report
```

All reports are saved to the `output/` folder as markdown files.

## Implemented Services

| Service | Script | Description |
|---------|--------|-------------|
| **M365/SharePoint** | `npm run sharepoint` | Lists SharePoint sites via MS Graph API |
| **Huntress** | `npm run huntress` | EDR: organizations, agents, health summary, incidents |
| **Atera** | `npm run atera` | RMM: customers, agents, alerts, tickets |
| **Dropsuite** | `npm run dropsuite` | M365 backup: Exchange, OneDrive, SharePoint, Teams |
| **ConnectSecure** | `npm run cybersecure` | Vulnerability management: companies, assets, vulnerabilities |

### Planned Services

- Dynamics 365
- Usecure
- Xero

## Project Structure

```
AI-Agile/
├── .env                 # Encrypted environment variables (safe to commit)
├── .env.keys            # Private key (DO NOT COMMIT)
├── package.json
├── services/
│   ├── list-sharepoint-sites.js
│   ├── huntress.js
│   ├── atera.js
│   ├── dropsuite.js
│   └── cybersecure.js
├── output/              # Generated reports (markdown)
│   ├── sharepoint-sites.md
│   ├── huntress-report.md
│   ├── atera-report.md
│   ├── dropsuite-report.md
│   └── cybersecure-report.md
└── scripts/
    ├── get-env-key.ps1
    └── run-with-env.sh
```

## Environment Variables

All secrets are stored in `.env` and encrypted using dotenvx.

### Required Variables by Service

**MS Graph (SharePoint)**
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`

**Huntress**
- `HUNTRESS_API_KEY`
- `HUNTRESS_API_SECRET`

**Atera**
- `ATERA_API_KEY`

**Dropsuite**
- `DROPSUITE_API_URL`
- `DROPSUITE_API_AUTHENTICATION_TOKEN`
- `DROPSUITE_API_RESELLER_TOKEN`

**ConnectSecure (CyberSecure)**
- `CYBERSECURE_CLIENT_ID`
- `CYBERSECURE_CLIENT_SECRET`
- `CYBERSECURE_API_URL` (optional, defaults to pod300)

### How Encryption Works

```
┌─────────────────────────────────────────────────────────────┐
│                      ENCRYPTION                             │
├─────────────────────────────────────────────────────────────┤
│  .env (plaintext)                                           │
│       │                                                     │
│       ▼                                                     │
│  npx dotenvx encrypt                                        │
│       │                                                     │
│       ├──► .env (encrypted values + DOTENV_PUBLIC_KEY)      │
│       └──► .env.keys (DOTENV_PRIVATE_KEY) ← DO NOT COMMIT   │
├─────────────────────────────────────────────────────────────┤
│                      DECRYPTION                             │
├─────────────────────────────────────────────────────────────┤
│  npm run <script>                                           │
│       │                                                     │
│       ▼                                                     │
│  dotenvx run -- node services/<script>.js                   │
│       │                                                     │
│       ├──► Reads .env.keys for private key                  │
│       ├──► Decrypts .env values                             │
│       └──► Injects into process.env                         │
└─────────────────────────────────────────────────────────────┘
```

### Decrypt .env for editing

```bash
npx dotenvx decrypt
```

### Re-encrypt after editing

```bash
npx dotenvx encrypt
```

## Azure App Registration

- **App Name:** AI Access Registration
- **App ID:** 8ea08429-3b94-4545-a1e1-dcebd191d69a
- **Tenant ID:** 861e0704-d666-492c-9d71-ad5689c392e3

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

## Adding New Services

1. Create file in `services/` folder
2. Add npm script in `package.json`:
   ```json
   "scriptname": "dotenvx run -- node services/your-service.js"
   ```
3. Run with `npm run scriptname`

## Credential Manager (Optional)

For secrets that can't go in `.env`, use Windows Credential Manager.

**Create:**
```bash
cmdkey.exe /generic:TARGET /user:USER /pass:PASS
```

**Retrieve (from WSL):**
```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -ExecutionPolicy Bypass -Command "Import-Module CredentialManager; \$cred = Get-StoredCredential -Target 'TARGET'; Write-Output \$cred.GetNetworkCredential().Password"
```

Requires CredentialManager module in Windows PowerShell 5.1:
```powershell
Install-Module -Name CredentialManager -Force -Scope CurrentUser
```
