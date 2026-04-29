const fs = require('fs').promises;
const path = require('path');

/**
 * Configuration loader for document generation jobs
 * Load and validate job configurations from JSON files
 */

/**
 * Load job configuration from a JSON file
 * @param {string} configPath - Path to configuration file
 * @returns {Promise<Object>} Job configuration
 */
async function loadConfig(configPath) {
    try {
        const content = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(content);
        
        // Apply environment variable overrides
        applyEnvOverrides(config);
        
        // Validate configuration
        validateConfig(config);
        
        return config;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        console.error('Error loading configuration:', error.message);
        throw error;
    }
}

/**
 * Apply environment variable overrides to configuration
 * Environment variables can override config values using pattern: DOCGEN_<SECTION>_<KEY>
 * Example: DOCGEN_TEMPLATE_SITEPATH overrides template.sitePath
 * @param {Object} config - Configuration object (modified in place)
 */
function applyEnvOverrides(config) {
    const prefix = 'DOCGEN_';
    
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(prefix)) {
            const path = key.substring(prefix.length).toLowerCase().split('_');
            
            let target = config;
            for (let i = 0; i < path.length - 1; i++) {
                const segment = path[i];
                if (!target[segment]) {
                    target[segment] = {};
                }
                target = target[segment];
            }
            
            const finalKey = path[path.length - 1];
            target[finalKey] = value;
        }
    }
}

/**
 * Validate job configuration
 * @param {Object} config - Configuration object
 * @throws {Error} If configuration is invalid
 */
function validateConfig(config) {
    const required = ['template', 'sources', 'output'];
    
    for (const field of required) {
        if (!config[field]) {
            throw new Error(`Missing required configuration field: ${field}`);
        }
    }

    // Validate template configuration
    if (!config.template.sitePath && !config.template.siteId) {
        throw new Error('Template configuration must include either sitePath or siteId');
    }
    if (!config.template.filePath && !config.template.itemId) {
        throw new Error('Template configuration must include either filePath or itemId');
    }

    // Validate sources configuration
    if (!Array.isArray(config.sources) || config.sources.length === 0) {
        throw new Error('Sources must be a non-empty array');
    }

    for (const source of config.sources) {
        if (!source.sitePath && !source.siteId) {
            throw new Error('Each source must include either sitePath or siteId');
        }
        if (!source.filePath && !source.itemId) {
            throw new Error('Each source must include either filePath or itemId');
        }
    }

    // Validate output configuration
    if (!config.output.filename) {
        throw new Error('Output configuration must include filename');
    }
}

/**
 * Create a sample configuration object
 * @returns {Object} Sample job configuration
 */
function createSampleConfig() {
    return {
        name: "Sample Document Generation Job",
        description: "Example configuration for document generation",
        
        template: {
            sitePath: "sites/Templates",
            driveId: "b!...", // Optional: specify drive ID
            filePath: "Templates/Proposal-Template.docx",
            // Or use itemId instead of filePath
            // itemId: "01ABC..."
        },
        
        sources: [
            {
                sitePath: "sites/ClientData",
                driveId: "b!...", // Optional
                filePath: "Clients/Acme-Corp/details.docx",
                // Or use itemId
                // itemId: "01XYZ..."
            },
            {
                sitePath: "sites/ClientData",
                filePath: "Clients/Acme-Corp/pricing.pdf"
            }
        ],
        
        extraction: {
            // Optional: Custom regex patterns for data extraction
            patterns: {
                company: "Company:\\s*(.+)",
                contact: "Contact:\\s*(.+)",
                amount: "Amount:\\s*\\$?([\\d,]+)"
            },
            // Whether to also parse key-value pairs automatically
            parseKeyValues: true
        },
        
        generation: {
            // Optional: Custom delimiters (default is {{ }})
            delimiters: {
                start: "{{",
                end: "}}"
            }
        },
        
        output: {
            filename: "Proposal-Acme-Corp.docx",
            
            // Local output
            local: {
                enabled: true,
                directory: "./output"
            },
            
            // SharePoint output (optional)
            sharepoint: {
                enabled: false,
                sitePath: "sites/Generated",
                driveId: "b!...", // Optional
                folderPath: "Proposals/2026"
            }
        },
        
        // Optional: Additional static data to merge
        staticData: {
            author: "AGILE IT LTD",
            date: new Date().toISOString().split('T')[0]
        }
    };
}

/**
 * Save configuration to file
 * @param {string} configPath - Path where to save configuration
 * @param {Object} config - Configuration object
 * @returns {Promise<void>}
 */
async function saveConfig(configPath, config) {
    try {
        const dir = path.dirname(configPath);
        await fs.mkdir(dir, { recursive: true });
        
        const content = JSON.stringify(config, null, 2);
        await fs.writeFile(configPath, content, 'utf8');
    } catch (error) {
        console.error('Error saving configuration:', error.message);
        throw error;
    }
}

/**
 * List all configuration files in a directory
 * @param {string} configDir - Directory containing config files
 * @returns {Promise<Array<string>>} List of config file paths
 */
async function listConfigs(configDir) {
    try {
        const files = await fs.readdir(configDir);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => path.join(configDir, file));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

module.exports = {
    loadConfig,
    applyEnvOverrides,
    validateConfig,
    createSampleConfig,
    saveConfig,
    listConfigs
};
