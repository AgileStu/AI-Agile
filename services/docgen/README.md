# SharePoint Document Generation Service

A comprehensive document generation service that extracts data from SharePoint Word and PDF files, applies it to Word templates, and generates customized documents.

## Features

- 📂 **Browse SharePoint** - Navigate sites, drives, and folders
- 📄 **Extract Data** - Pull data from Word (.docx) and PDF files
- 🔄 **Template Processing** - Use Word templates with `{{placeholder}}` tokens
- 💾 **Flexible Output** - Save locally and/or upload to SharePoint
- 🎯 **Two Modes** - Interactive CLI or config-driven automation

## Installation

Dependencies are already installed:
- `docxtemplater` - Template placeholder substitution
- `pizzip` - Required by docxtemplater
- `mammoth` - Extract text from Word docs
- `pdf-parse` - Extract text from PDFs

## Usage

### Interactive Mode

Run the interactive wizard to browse SharePoint and generate documents:

```bash
npm run docgen
```

The wizard will guide you through:
1. Selecting a SharePoint site
2. Choosing a document library
3. Selecting a template file (.docx)
4. Selecting source files (.docx, .pdf)
5. Extracting data and previewing
6. Generating the document
7. Optionally uploading to SharePoint

### Config Mode

Run automated jobs using configuration files:

```bash
npm run docgen:job config/docgen/my-job.json
```

### Create Sample Configuration

Generate a sample configuration file:

```bash
npm run docgen:sample
```

This creates `config/docgen/sample-job.json` that you can customize.

## Configuration File Structure

```json
{
  "name": "Job Name",
  "description": "Job description",
  
  "template": {
    "sitePath": "sites/Templates",
    "driveId": "optional-drive-id",
    "filePath": "Templates/MyTemplate.docx"
  },
  
  "sources": [
    {
      "sitePath": "sites/Data",
      "filePath": "Path/To/source1.docx"
    },
    {
      "sitePath": "sites/Data",
      "filePath": "Path/To/source2.pdf"
    }
  ],
  
  "extraction": {
    "patterns": {
      "fieldname": "Pattern:\\s*(.+)"
    },
    "parseKeyValues": true
  },
  
  "generation": {
    "delimiters": {
      "start": "{{",
      "end": "}}"
    }
  },
  
  "output": {
    "filename": "Generated-Document.docx",
    "local": {
      "enabled": true,
      "directory": "./output"
    },
    "sharepoint": {
      "enabled": false,
      "sitePath": "sites/Output",
      "folderPath": "Generated/2026"
    }
  },
  
  "staticData": {
    "author": "Your Name",
    "date": "2026-02-05"
  }
}
```

## Template Format

Create Word templates with placeholders using double curly braces:

```
Company Name: {{company}}
Contact: {{contact}}
Amount: ${{amount}}

Dear {{contact}},

Thank you for your interest in {{company}}...
```

## Data Extraction

The service extracts data from source files using two methods:

### 1. Automatic Key-Value Parsing

Supports these formats:
- `Key: Value`
- `Key = Value`
- `Key | Value`

Example source file:
```
Company: Acme Corporation
Contact: John Smith
Amount: $50,000
```

### 2. Custom Regex Patterns

Define patterns in the config:

```json
"extraction": {
  "patterns": {
    "company": "Company:\\s*(.+)",
    "contact": "Contact:\\s*(.+)",
    "email": "Email:\\s*([\\w._%+-]+@[\\w.-]+\\.[A-Za-z]{2,})"
  }
}
```

## Environment Variables

Required environment variables (already configured in `.env`):
- `MS_TENANT_ID` - Azure AD tenant ID
- `MS_CLIENT_ID` - Azure AD application (client) ID
- `MS_CLIENT_SECRET` - Azure AD client secret
- `MS_DOMAIN` - SharePoint domain (e.g., `yourdomain.sharepoint.com`)

Optional overrides for config values:
- `DOCGEN_TEMPLATE_SITEPATH` - Override template site path
- `DOCGEN_OUTPUT_FILENAME` - Override output filename
- etc.

## File Structure

```
services/docgen/
├── index.js              - Main entry point
├── graph-client.js       - MS Graph authentication
├── sharepoint-browser.js - Browse SharePoint
├── file-handler.js       - Download/upload files
├── extractors.js         - Extract data from documents
├── generator.js          - Generate documents from templates
└── config-loader.js      - Load job configurations

config/docgen/
└── sample-job.json       - Example configuration
```

## Use Cases

1. **Proposals & Quotes**
   - Template: Proposal template with pricing tables
   - Sources: Client details, product specs, pricing sheets
   - Output: Customized proposal document

2. **Reports**
   - Template: Monthly report format
   - Sources: Data exports, analysis documents
   - Output: Formatted report with current data

3. **Contracts**
   - Template: Legal contract template
   - Sources: Client information, terms documents
   - Output: Personalized contract

4. **Documentation**
   - Template: Documentation structure
   - Sources: Technical specifications, user guides
   - Output: Complete documentation package

## Permissions

The service requires these Microsoft Graph permissions:
- `Sites.Read.All` - Read SharePoint sites and files
- `Sites.ReadWrite.All` - Upload files to SharePoint (optional)
- `Files.Read.All` - Read files
- `Files.ReadWrite.All` - Write files (optional)

Current permissions support reading files. To enable SharePoint upload, update your Azure AD app permissions.

## Troubleshooting

### "Missing required environment variables"
- Ensure `.env` file exists with MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET

### "Template generation errors"
- Check that template placeholders match extracted data keys
- Verify template file is a valid .docx file
- Ensure placeholder syntax is correct: `{{key}}`

### "Error downloading file"
- Verify file path is correct relative to drive root
- Check SharePoint permissions
- Ensure site path format: `sites/SiteName`

### "Error extracting text"
- Ensure source files are .docx or .pdf format
- Check that files are not password-protected
- Verify files contain extractable text (not just images)

## Examples

### Example 1: Simple Proposal

Template (`Proposal-Template.docx`):
```
Proposal for {{company}}

Dear {{contact}},

We are pleased to present this proposal for ${{amount}}.

Services:
{{services}}

Thank you,
{{author}}
```

Source (`client-data.docx`):
```
Company: Acme Corp
Contact: Jane Doe
Amount: 25,000
Services: Cloud migration and consulting
```

Result: Fully populated proposal with all fields filled.

### Example 2: Monthly Report

Template with loops and conditionals using docxtemplater advanced features.

## API Reference

See individual module files for detailed API documentation:
- [graph-client.js](services/docgen/graph-client.js)
- [sharepoint-browser.js](services/docgen/sharepoint-browser.js)
- [file-handler.js](services/docgen/file-handler.js)
- [extractors.js](services/docgen/extractors.js)
- [generator.js](services/docgen/generator.js)
- [config-loader.js](services/docgen/config-loader.js)

## Advanced Features

### Large File Upload
Files larger than 4MB automatically use chunked upload sessions.

### Multiple Sources
Data from multiple source files is merged, with later sources overwriting earlier ones.

### Custom Delimiters
Change placeholder delimiters from `{{}}` to `[[]]` or any other markers:

```json
"generation": {
  "delimiters": {
    "start": "[[",
    "end": "]]"
  }
}
```

### Static Data
Add static values that don't come from source files:

```json
"staticData": {
  "company": "AGILE IT LTD",
  "year": "2026",
  "version": "1.0"
}
```

## Best Practices

1. **Template Design**
   - Use clear, descriptive placeholder names
   - Test templates with sample data first
   - Keep placeholders simple (avoid special characters)

2. **Data Extraction**
   - Use consistent formatting in source documents
   - Combine automatic parsing with custom patterns
   - Preview extracted data before generating

3. **File Organization**
   - Keep templates in a dedicated SharePoint library
   - Organize source files in logical folder structures
   - Use descriptive filenames

4. **Configuration Management**
   - Create separate configs for different document types
   - Use environment variables for sensitive data
   - Version control your configuration files

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the SharePoint plan: [SharePointPlan.md](SharePointPlan.md)
3. Examine service logs for detailed error messages

## License

Internal use - AGILE IT LTD
