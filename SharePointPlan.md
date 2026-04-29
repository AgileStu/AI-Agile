# SharePoint Document Generation Service - Implementation Plan

## Overview

Create a document generation service that:
1. Browses SharePoint to find Word (.docx) and PDF source files
2. Extracts data from source files
3. Applies data to Word templates with `{{placeholder}}` tokens
4. Generates Word documents saved locally and uploaded to SharePoint

## New Dependencies

Add to `package.json`:
```
docxtemplater: ^3.47.0   - Template placeholder substitution
pizzip: ^3.1.6           - Required by docxtemplater
mammoth: ^1.11.0         - Extract text from Word docs
pdf-parse: ^2.4.5        - Extract text from PDFs
```

## File Structure

```
services/docgen/
├── index.js              # Main entry point (interactive + config modes)
├── graph-client.js       # Shared MS Graph authentication
├── sharepoint-browser.js # Browse sites/drives/folders
├── file-handler.js       # Download and upload files
├── extractors.js         # Extract data from docx/pdf
├── generator.js          # Generate docx from templates
└── config-loader.js      # Load job configurations

config/
└── docgen/
    └── sample-job.json   # Example job configuration
```

## Implementation Steps

### Step 1: Install dependencies
```bash
npm install docxtemplater pizzip mammoth pdf-parse
```

### Step 2: Create `services/docgen/graph-client.js`
- Extract authentication pattern from list-sharepoint-sites.js
- Export `createGraphClient(tenantId, clientId, clientSecret)`

### Step 3: Create `services/docgen/sharepoint-browser.js`
- `getSiteByPath(client, sitePath)` - Get site by path (e.g., "sites/Templates")
- `getDrives(client, siteId)` - List document libraries
- `listFolder(client, siteId, driveId, folderPath)` - List folder contents
- `filterByType(items, extensions)` - Filter by .docx, .pdf

### Step 4: Create `services/docgen/file-handler.js`
- `downloadFile(client, siteId, driveId, itemId)` - Returns Buffer
- `uploadFile(client, siteId, driveId, path, buffer)` - Upload to SharePoint
- `saveLocal(outputDir, filename, buffer)` - Save to local /output

### Step 5: Create `services/docgen/extractors.js`
- `extractFromDocx(buffer)` - Use mammoth to extract text
- `extractFromPdf(buffer)` - Use pdf-parse to extract text
- `parseKeyValues(text)` - Extract key:value pairs
- `extractWithRegex(text, patterns)` - Custom pattern extraction

### Step 6: Create `services/docgen/generator.js`
- `generateFromTemplate(templateBuffer, data)` - Use docxtemplater
- Configure `{{placeholder}}` delimiters

### Step 7: Create `services/docgen/config-loader.js`
- Load job config from JSON file
- Support environment variable overrides

### Step 8: Create `services/docgen/index.js`
Main entry point with two modes:

**Interactive mode** (`npm run docgen`):
1. List available SharePoint sites
2. User selects template location
3. User selects source files
4. Extract data, show preview
5. User confirms, generate document

**Config mode** (`npm run docgen:job config/docgen/job.json`):
1. Load job configuration
2. Fetch template and sources automatically
3. Generate and save document

### Step 9: Update `package.json` scripts
```json
"docgen": "dotenvx run -- node services/docgen/index.js",
"docgen:job": "dotenvx run -- node services/docgen/index.js --job"
```

### Step 10: Create sample job configuration
`config/docgen/sample-job.json` with template path, source paths, placeholder mappings

## Azure Permission Note

Current permissions allow reading. For uploading back to SharePoint, may need:
- `Sites.ReadWrite.All` or `Files.ReadWrite.All`

Can start with local-only output, add upload later if needed.

## Verification

1. Run `npm run docgen` - should list SharePoint sites
2. Navigate to templates folder, select a template
3. Navigate to sources folder, select source files
4. Confirm extraction shows expected data
5. Generate document, verify output in `/output` and SharePoint

## Critical Files

- `/services/list-sharepoint-sites.js` - Pattern reference
- `/package.json` - Add dependencies and scripts
- `/CLAUDE.md` - Update documentation

---

## User Decisions Captured

- **Input files**: Word (.docx) and PDF
- **Templates**: Word docs with `{{placeholder}}` tokens
- **Output format**: Word (.docx)
- **Use cases**: Reports, Proposals/Quotes, Documentation, Contracts/Legal
- **SharePoint sites**: Flexible/configurable (not yet determined)
- **Run mode**: Both interactive CLI and config-driven
- **Output destination**: Both local and SharePoint
