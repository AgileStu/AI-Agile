#!/usr/bin/env node

/**
 * SharePoint Document Generation Service
 * 
 * Main entry point supporting two modes:
 * 1. Interactive mode: npm run docgen
 * 2. Config mode: npm run docgen:job <config-file>
 */

const readline = require('readline');
const path = require('path');
const { createGraphClientFromEnv } = require('./graph-client');
const { listSites, getSiteByPath, getDrives, listFolder, filterByType } = require('./sharepoint-browser');
const { downloadFile, downloadFileByPath, uploadFile, saveLocal } = require('./file-handler');
const { extractFromMultipleSources, createDataPreview } = require('./extractors');
const { generateFromTemplate, validateTemplate } = require('./generator');
const { loadConfig, createSampleConfig, saveConfig } = require('./config-loader');

// Parse command line arguments
const args = process.argv.slice(2);
const isConfigMode = args.includes('--job') || args.includes('-j');
const configPath = isConfigMode ? args.find(arg => !arg.startsWith('-')) : null;

// Create readline interface for interactive mode
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Prompt user for input
 */
function question(prompt) {
    return new Promise(resolve => {
        rl.question(prompt, resolve);
    });
}

/**
 * Display menu and get user selection
 */
async function selectFromList(items, displayFn, prompt) {
    console.log('\n' + prompt);
    items.forEach((item, index) => {
        console.log(`  ${index + 1}. ${displayFn(item)}`);
    });
    console.log('  0. Cancel\n');

    const answer = await question('Select number: ');
    const selection = parseInt(answer);

    if (selection === 0) {
        return null;
    }

    if (selection > 0 && selection <= items.length) {
        return items[selection - 1];
    }

    console.log('Invalid selection.');
    return null;
}

/**
 * Interactive mode workflow
 */
async function runInteractiveMode() {
    console.log('=== SharePoint Document Generation Service ===\n');
    console.log('Interactive Mode\n');

    try {
        // Initialize Graph client
        console.log('Initializing Microsoft Graph client...');
        const client = createGraphClientFromEnv();

        // Step 1: List and select site
        console.log('\nFetching SharePoint sites...');
        const sites = await listSites(client);
        
        const selectedSite = await selectFromList(
            sites,
            site => `${site.displayName} (${site.webUrl})`,
            'Available SharePoint Sites:'
        );

        if (!selectedSite) {
            console.log('Operation cancelled.');
            return;
        }

        console.log(`\nSelected: ${selectedSite.displayName}`);

        // Step 2: List and select drive
        console.log('\nFetching document libraries...');
        const drives = await getDrives(client, selectedSite.id);

        const selectedDrive = await selectFromList(
            drives,
            drive => `${drive.name} (${drive.driveType})`,
            'Available Document Libraries:'
        );

        if (!selectedDrive) {
            console.log('Operation cancelled.');
            return;
        }

        console.log(`\nSelected: ${selectedDrive.name}`);

        // Step 3: Select template
        console.log('\n--- Template Selection ---');
        const templatePath = await question('Enter template folder path (or press Enter for root): ');
        
        console.log('\nFetching files...');
        const templateFiles = await listFolder(
            client,
            selectedSite.id,
            selectedDrive.id,
            templatePath || 'root'
        );

        const docxTemplates = filterByType(templateFiles, ['.docx']);

        const selectedTemplate = await selectFromList(
            docxTemplates,
            file => file.name,
            'Available Templates:'
        );

        if (!selectedTemplate) {
            console.log('Operation cancelled.');
            return;
        }

        console.log(`\nSelected template: ${selectedTemplate.name}`);
        console.log('Downloading template...');
        const templateBuffer = await downloadFile(
            client,
            selectedSite.id,
            selectedDrive.id,
            selectedTemplate.id
        );

        // Step 4: Select source files
        console.log('\n--- Source File Selection ---');
        const sourcePath = await question('Enter source folder path (or press Enter for root): ');
        
        console.log('\nFetching files...');
        const sourceFiles = await listFolder(
            client,
            selectedSite.id,
            selectedDrive.id,
            sourcePath || 'root'
        );

        const supportedSources = filterByType(sourceFiles, ['.docx', '.pdf']);

        console.log('\nAvailable Source Files:');
        supportedSources.forEach((file, index) => {
            console.log(`  ${index + 1}. ${file.name}`);
        });
        console.log('  0. Done selecting\n');

        const selectedSources = [];
        let selecting = true;

        while (selecting) {
            const answer = await question('Select file number (0 when done): ');
            const selection = parseInt(answer);

            if (selection === 0) {
                selecting = false;
            } else if (selection > 0 && selection <= supportedSources.length) {
                const file = supportedSources[selection - 1];
                if (!selectedSources.find(f => f.id === file.id)) {
                    selectedSources.push(file);
                    console.log(`  Added: ${file.name}`);
                } else {
                    console.log('  File already selected.');
                }
            } else {
                console.log('  Invalid selection.');
            }
        }

        if (selectedSources.length === 0) {
            console.log('\nNo source files selected. Operation cancelled.');
            return;
        }

        // Step 5: Download and extract data from sources
        console.log('\n--- Data Extraction ---');
        const sources = [];

        for (const file of selectedSources) {
            console.log(`Downloading and extracting: ${file.name}...`);
            const buffer = await downloadFile(
                client,
                selectedSite.id,
                selectedDrive.id,
                file.id
            );
            sources.push({ buffer, filename: file.name });
        }

        const extractedData = await extractFromMultipleSources(sources);
        
        console.log('\n' + createDataPreview(extractedData));

        // Step 6: Confirm and generate
        const confirm = await question('\nProceed with document generation? (y/n): ');
        
        if (confirm.toLowerCase() !== 'y') {
            console.log('Operation cancelled.');
            return;
        }

        console.log('\nGenerating document...');
        const generatedBuffer = await generateFromTemplate(templateBuffer, extractedData);

        // Step 7: Save output
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const outputFilename = `generated-${timestamp}.docx`;
        const outputDir = path.join(process.cwd(), 'output');

        console.log('Saving document...');
        const savedPath = await saveLocal(outputDir, outputFilename, generatedBuffer);

        console.log(`\n✓ Document generated successfully!`);
        console.log(`  Saved to: ${savedPath}`);

        // Optional: Upload to SharePoint
        const uploadToSP = await question('\nUpload to SharePoint? (y/n): ');
        
        if (uploadToSP.toLowerCase() === 'y') {
            const uploadPath = await question('Enter target path in SharePoint: ');
            
            console.log('Uploading to SharePoint...');
            await uploadFile(
                client,
                selectedSite.id,
                selectedDrive.id,
                uploadPath || `Generated/${outputFilename}`,
                generatedBuffer
            );
            console.log('✓ Uploaded to SharePoint!');
        }

    } catch (error) {
        console.error('\n✗ Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        rl.close();
    }
}

/**
 * Config mode workflow
 */
async function runConfigMode(configFilePath) {
    console.log('=== SharePoint Document Generation Service ===\n');
    console.log('Config Mode\n');

    try {
        // Load configuration
        console.log(`Loading configuration from: ${configFilePath}`);
        const config = await loadConfig(configFilePath);
        console.log(`Job: ${config.name || 'Unnamed'}`);
        if (config.description) {
            console.log(`Description: ${config.description}`);
        }

        // Initialize Graph client
        console.log('\nInitializing Microsoft Graph client...');
        const client = createGraphClientFromEnv();

        // Fetch template
        console.log('\n--- Fetching Template ---');
        const templateSite = config.template.sitePath
            ? await getSiteByPath(client, config.template.sitePath)
            : { id: config.template.siteId };

        console.log(`Template site: ${templateSite.id}`);

        const templateBuffer = config.template.filePath
            ? await downloadFileByPath(client, templateSite.id, config.template.driveId, config.template.filePath)
            : await downloadFile(client, templateSite.id, config.template.driveId, config.template.itemId);

        console.log('✓ Template downloaded');

        // Fetch and extract from sources
        console.log('\n--- Fetching Source Files ---');
        const sources = [];

        for (const sourceConfig of config.sources) {
            const sourceSite = sourceConfig.sitePath
                ? await getSiteByPath(client, sourceConfig.sitePath)
                : { id: sourceConfig.siteId };

            const buffer = sourceConfig.filePath
                ? await downloadFileByPath(client, sourceSite.id, sourceConfig.driveId, sourceConfig.filePath)
                : await downloadFile(client, sourceSite.id, sourceConfig.driveId, sourceConfig.itemId);

            const filename = sourceConfig.filePath?.split('/').pop() || sourceConfig.itemId;
            sources.push({ buffer, filename });
            console.log(`✓ Downloaded: ${filename}`);
        }

        // Extract data
        console.log('\n--- Extracting Data ---');
        const extractedData = await extractFromMultipleSources(sources, config.extraction);

        // Merge with static data if provided
        const finalData = { ...extractedData, ...config.staticData };

        console.log('\n' + createDataPreview(finalData));

        // Generate document
        console.log('\n--- Generating Document ---');
        const generatedBuffer = await generateFromTemplate(
            templateBuffer,
            finalData,
            config.generation
        );
        console.log('✓ Document generated');

        // Save locally
        if (config.output.local?.enabled !== false) {
            const outputDir = config.output.local?.directory || './output';
            const savedPath = await saveLocal(outputDir, config.output.filename, generatedBuffer);
            console.log(`✓ Saved locally: ${savedPath}`);
        }

        // Upload to SharePoint
        if (config.output.sharepoint?.enabled) {
            console.log('\n--- Uploading to SharePoint ---');
            const outputSite = config.output.sharepoint.sitePath
                ? await getSiteByPath(client, config.output.sharepoint.sitePath)
                : { id: config.output.sharepoint.siteId };

            const targetPath = config.output.sharepoint.folderPath
                ? `${config.output.sharepoint.folderPath}/${config.output.filename}`
                : config.output.filename;

            await uploadFile(
                client,
                outputSite.id,
                config.output.sharepoint.driveId,
                targetPath,
                generatedBuffer
            );
            console.log(`✓ Uploaded to SharePoint: ${targetPath}`);
        }

        console.log('\n✓ Job completed successfully!');

    } catch (error) {
        console.error('\n✗ Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

/**
 * Generate sample configuration file
 */
async function generateSampleConfig() {
    const sampleConfig = createSampleConfig();
    const configPath = path.join(process.cwd(), 'config', 'docgen', 'sample-job.json');
    
    await saveConfig(configPath, sampleConfig);
    console.log(`Sample configuration created at: ${configPath}`);
}

/**
 * Main entry point
 */
async function main() {
    try {
        // Check for sample config generation flag
        if (args.includes('--create-sample')) {
            await generateSampleConfig();
            return;
        }

        // Run appropriate mode
        if (isConfigMode) {
            if (!configPath) {
                console.error('Error: Please provide a configuration file path');
                console.error('Usage: npm run docgen:job <config-file>');
                process.exit(1);
            }
            await runConfigMode(configPath);
        } else {
            await runInteractiveMode();
        }
    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

// Run main function
main();
