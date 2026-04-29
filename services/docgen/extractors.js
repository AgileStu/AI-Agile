const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

/**
 * Data extraction utilities
 * Extract text and key-value pairs from Word and PDF documents
 */

/**
 * Extract text from a Word document (.docx)
 * @param {Buffer} buffer - Word document buffer
 * @returns {Promise<string>} Extracted text
 */
async function extractFromDocx(buffer) {
    try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    } catch (error) {
        console.error('Error extracting text from Word document:', error.message);
        throw error;
    }
}

/**
 * Extract text from a PDF document
 * @param {Buffer} buffer - PDF document buffer
 * @returns {Promise<string>} Extracted text
 */
async function extractFromPdf(buffer) {
    try {
        const data = await pdfParse(buffer);
        return data.text;
    } catch (error) {
        console.error('Error extracting text from PDF:', error.message);
        throw error;
    }
}

/**
 * Extract text based on file type
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - File name (used to determine type)
 * @returns {Promise<string>} Extracted text
 */
async function extractText(buffer, filename) {
    const ext = filename.toLowerCase().split('.').pop();
    
    switch (ext) {
        case 'docx':
            return await extractFromDocx(buffer);
        case 'pdf':
            return await extractFromPdf(buffer);
        default:
            throw new Error(`Unsupported file type: ${ext}`);
    }
}

/**
 * Parse key-value pairs from text
 * Supports formats:
 * - Key: Value
 * - Key = Value
 * - Key | Value
 * @param {string} text - Text content
 * @returns {Object} Parsed key-value pairs
 */
function parseKeyValues(text) {
    const data = {};
    const lines = text.split('\n');

    for (const line of lines) {
        // Match various key-value formats
        const patterns = [
            /^([^:=|]+):\s*(.+)$/,     // Key: Value
            /^([^:=|]+)=\s*(.+)$/,     // Key = Value
            /^([^:=|]+)\|\s*(.+)$/,    // Key | Value
        ];

        for (const pattern of patterns) {
            const match = line.trim().match(pattern);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                
                // Create a valid placeholder key (remove spaces, special chars)
                const placeholderKey = key.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_+|_+$/g, '');
                
                data[placeholderKey] = value;
                break;
            }
        }
    }

    return data;
}

/**
 * Extract data using custom regex patterns
 * @param {string} text - Text content
 * @param {Object} patterns - Object with keys and regex patterns
 *                            Example: { company: /Company:\s*(.+)/, amount: /Amount:\s*\$?([\d,]+)/ }
 * @returns {Object} Extracted data matching patterns
 */
function extractWithRegex(text, patterns) {
    const data = {};

    for (const [key, pattern] of Object.entries(patterns)) {
        const match = text.match(pattern);
        if (match && match[1]) {
            data[key] = match[1].trim();
        }
    }

    return data;
}

/**
 * Extract structured data from a document
 * First tries regex patterns, then falls back to key-value parsing
 * @param {string} text - Text content
 * @param {Object} options - Extraction options
 * @param {Object} options.patterns - Regex patterns for extraction
 * @param {boolean} options.parseKeyValues - Whether to parse key-value pairs (default: true)
 * @returns {Object} Extracted data
 */
function extractStructuredData(text, options = {}) {
    const { patterns = null, parseKeyValues: shouldParseKeyValues = true } = options;
    
    let data = {};

    // First try custom regex patterns if provided
    if (patterns) {
        data = { ...data, ...extractWithRegex(text, patterns) };
    }

    // Then parse key-value pairs if enabled
    if (shouldParseKeyValues) {
        const keyValueData = parseKeyValues(text);
        // Don't overwrite existing data from patterns
        data = { ...keyValueData, ...data };
    }

    return data;
}

/**
 * Extract data from multiple source files
 * @param {Array<{buffer: Buffer, filename: string}>} sources - Array of source files
 * @param {Object} options - Extraction options (passed to extractStructuredData)
 * @returns {Promise<Object>} Combined extracted data from all sources
 */
async function extractFromMultipleSources(sources, options = {}) {
    const combinedData = {};

    for (const source of sources) {
        try {
            const text = await extractText(source.buffer, source.filename);
            const data = extractStructuredData(text, options);
            
            // Merge data, later sources can overwrite earlier ones
            Object.assign(combinedData, data);
        } catch (error) {
            console.error(`Error extracting from ${source.filename}:`, error.message);
            // Continue with other files even if one fails
        }
    }

    return combinedData;
}

/**
 * Create a preview of extracted data
 * @param {Object} data - Extracted data
 * @param {number} maxValueLength - Maximum length for displayed values (default: 100)
 * @returns {string} Formatted preview string
 */
function createDataPreview(data, maxValueLength = 100) {
    const lines = ['Extracted Data:', ''];
    
    for (const [key, value] of Object.entries(data)) {
        const displayValue = value.length > maxValueLength 
            ? value.substring(0, maxValueLength) + '...' 
            : value;
        lines.push(`  ${key}: ${displayValue}`);
    }

    return lines.join('\n');
}

module.exports = {
    extractFromDocx,
    extractFromPdf,
    extractText,
    parseKeyValues,
    extractWithRegex,
    extractStructuredData,
    extractFromMultipleSources,
    createDataPreview
};
