const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

/**
 * Document generation utilities
 * Generate Word documents from templates using docxtemplater
 */

/**
 * Generate a Word document from a template
 * @param {Buffer} templateBuffer - Template file buffer (.docx)
 * @param {Object} data - Data to fill into template placeholders
 * @param {Object} options - Generation options
 * @param {string} options.delimiters - Custom delimiters (default: {{placeholder}})
 * @param {boolean} options.nullGetter - Function to handle null/undefined values
 * @returns {Promise<Buffer>} Generated document buffer
 */
async function generateFromTemplate(templateBuffer, data, options = {}) {
    try {
        // Load the template
        const zip = new PizZip(templateBuffer);
        
        // Create docxtemplater instance with default settings
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: options.delimiters || { start: '{{', end: '}}' },
            nullGetter: options.nullGetter || function(part) {
                // Return empty string for null/undefined values
                if (!part.module) {
                    return '';
                }
                if (part.module === 'rawxml') {
                    return '';
                }
                return '';
            }
        });

        // Set the template data
        doc.render(data);

        // Get the generated document as buffer
        const buffer = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE'
        });

        return buffer;
    } catch (error) {
        // Provide more detailed error information
        if (error.properties && error.properties.errors) {
            console.error('Template generation errors:');
            error.properties.errors.forEach(err => {
                console.error(`  - ${err.message} at ${err.part}`);
            });
        }
        console.error('Error generating document from template:', error.message);
        throw error;
    }
}

/**
 * Generate document with custom delimiter (e.g., [[placeholder]])
 * @param {Buffer} templateBuffer - Template file buffer
 * @param {Object} data - Data to fill into template
 * @param {string} startDelimiter - Start delimiter (e.g., '[[')
 * @param {string} endDelimiter - End delimiter (e.g., ']]')
 * @returns {Promise<Buffer>} Generated document buffer
 */
async function generateWithCustomDelimiters(templateBuffer, data, startDelimiter, endDelimiter) {
    return generateFromTemplate(templateBuffer, data, {
        delimiters: { start: startDelimiter, end: endDelimiter }
    });
}

/**
 * Validate template placeholders against data
 * Finds placeholders in template and checks if they exist in data
 * Note: This is a basic check - docxtemplater will show more detailed errors
 * @param {Buffer} templateBuffer - Template file buffer
 * @param {Object} data - Data object
 * @returns {Object} Validation result with missing and extra keys
 */
function validateTemplate(templateBuffer, data) {
    try {
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true
        });

        // Get all tags (placeholders) from template
        const templateText = doc.getFullText();
        const placeholderRegex = /\{\{([^}]+)\}\}/g;
        const placeholders = new Set();
        let match;

        while ((match = placeholderRegex.exec(templateText)) !== null) {
            // Extract just the variable name (remove any modifiers)
            const placeholder = match[1].trim().split(/[.\[]/, 1)[0];
            placeholders.add(placeholder);
        }

        // Check which placeholders are missing from data
        const dataKeys = new Set(Object.keys(data));
        const missingInData = [...placeholders].filter(key => !dataKeys.has(key));
        const extraInData = [...dataKeys].filter(key => !placeholders.has(key));

        return {
            valid: missingInData.length === 0,
            placeholders: [...placeholders],
            dataKeys: [...dataKeys],
            missingInData,
            extraInData
        };
    } catch (error) {
        console.error('Error validating template:', error.message);
        return {
            valid: false,
            error: error.message
        };
    }
}

/**
 * Get list of all placeholders in a template
 * @param {Buffer} templateBuffer - Template file buffer
 * @param {Object} options - Options for delimiter detection
 * @returns {Array<string>} List of placeholder names
 */
function getTemplatePlaceholders(templateBuffer, options = {}) {
    try {
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, {
            delimiters: options.delimiters || { start: '{{', end: '}}' }
        });

        const templateText = doc.getFullText();
        const startDelim = options.delimiters?.start || '{{';
        const endDelim = options.delimiters?.end || '}}';
        
        // Escape special regex characters
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapeRegex(startDelim) + '([^' + escapeRegex(endDelim) + ']+)' + escapeRegex(endDelim), 'g');
        
        const placeholders = new Set();
        let match;

        while ((match = regex.exec(templateText)) !== null) {
            const placeholder = match[1].trim().split(/[.\[]/, 1)[0];
            placeholders.add(placeholder);
        }

        return [...placeholders];
    } catch (error) {
        console.error('Error getting template placeholders:', error.message);
        throw error;
    }
}

/**
 * Generate multiple documents from same template with different data
 * @param {Buffer} templateBuffer - Template file buffer
 * @param {Array<Object>} dataArray - Array of data objects
 * @param {Object} options - Generation options
 * @returns {Promise<Array<Buffer>>} Array of generated document buffers
 */
async function generateMultiple(templateBuffer, dataArray, options = {}) {
    const results = [];
    
    for (const data of dataArray) {
        try {
            const buffer = await generateFromTemplate(templateBuffer, data, options);
            results.push({ success: true, buffer, data });
        } catch (error) {
            results.push({ success: false, error: error.message, data });
        }
    }

    return results;
}

module.exports = {
    generateFromTemplate,
    generateWithCustomDelimiters,
    validateTemplate,
    getTemplatePlaceholders,
    generateMultiple
};
