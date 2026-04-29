const fs = require('fs').promises;
const path = require('path');

/**
 * File handler for SharePoint operations
 * Upload, download, and local file operations
 */

/**
 * Download a file from SharePoint
 * @param {Client} client - MS Graph client
 * @param {string} siteId - SharePoint site ID
 * @param {string} driveId - Drive ID
 * @param {string} itemId - Item ID
 * @returns {Promise<Buffer>} File content as buffer
 */
async function downloadFile(client, siteId, driveId, itemId) {
    try {
        const response = await client.api(`/sites/${siteId}/drives/${driveId}/items/${itemId}/content`)
            .getStream();

        // Convert readable stream to buffer
        const chunks = [];
        for await (const chunk of response) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        console.error(`Error downloading file (itemId: ${itemId}):`, error.message);
        throw error;
    }
}

/**
 * Download file by path
 * @param {Client} client - MS Graph client
 * @param {string} siteId - SharePoint site ID
 * @param {string} driveId - Drive ID
 * @param {string} filePath - File path relative to root
 * @returns {Promise<Buffer>} File content as buffer
 */
async function downloadFileByPath(client, siteId, driveId, filePath) {
    try {
        // Remove leading slash if present
        const cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        
        const response = await client.api(`/sites/${siteId}/drives/${driveId}/root:/${cleanPath}:/content`)
            .getStream();

        // Convert readable stream to buffer
        const chunks = [];
        for await (const chunk of response) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        console.error(`Error downloading file by path '${filePath}':`, error.message);
        throw error;
    }
}

/**
 * Upload a file to SharePoint
 * @param {Client} client - MS Graph client
 * @param {string} siteId - SharePoint site ID
 * @param {string} driveId - Drive ID
 * @param {string} filePath - Target path in SharePoint (e.g., 'Generated/output.docx')
 * @param {Buffer} buffer - File content as buffer
 * @returns {Promise<Object>} Upload response with file metadata
 */
async function uploadFile(client, siteId, driveId, filePath, buffer) {
    try {
        // Remove leading slash if present
        const cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;

        // For files larger than 4MB, use upload session (Graph API requirement)
        // For simplicity, we'll use direct upload for smaller files
        if (buffer.length > 4 * 1024 * 1024) {
            // Large file upload session
            return await uploadLargeFile(client, siteId, driveId, cleanPath, buffer);
        }

        // Direct upload for smaller files
        const response = await client.api(`/sites/${siteId}/drives/${driveId}/root:/${cleanPath}:/content`)
            .put(buffer);

        return response;
    } catch (error) {
        console.error(`Error uploading file to '${filePath}':`, error.message);
        throw error;
    }
}

/**
 * Upload large files using upload session
 * @param {Client} client - MS Graph client
 * @param {string} siteId - SharePoint site ID
 * @param {string} driveId - Drive ID
 * @param {string} filePath - Target path in SharePoint
 * @param {Buffer} buffer - File content as buffer
 * @returns {Promise<Object>} Upload response
 */
async function uploadLargeFile(client, siteId, driveId, filePath, buffer) {
    try {
        // Create upload session
        const uploadSession = await client.api(`/sites/${siteId}/drives/${driveId}/root:/${filePath}:/createUploadSession`)
            .post({
                item: {
                    '@microsoft.graph.conflictBehavior': 'replace'
                }
            });

        const uploadUrl = uploadSession.uploadUrl;
        const fileSize = buffer.length;
        const chunkSize = 320 * 1024; // 320 KB chunks
        let offset = 0;

        while (offset < fileSize) {
            const chunk = buffer.slice(offset, Math.min(offset + chunkSize, fileSize));
            const contentRange = `bytes ${offset}-${offset + chunk.length - 1}/${fileSize}`;

            const response = await client.api(uploadUrl)
                .headers({
                    'Content-Range': contentRange,
                    'Content-Length': chunk.length.toString()
                })
                .put(chunk);

            offset += chunk.length;

            if (response.id) {
                // Upload complete
                return response;
            }
        }
    } catch (error) {
        console.error('Error in large file upload:', error.message);
        throw error;
    }
}

/**
 * Save file to local filesystem
 * @param {string} outputDir - Output directory path
 * @param {string} filename - File name
 * @param {Buffer} buffer - File content as buffer
 * @returns {Promise<string>} Full path to saved file
 */
async function saveLocal(outputDir, filename, buffer) {
    try {
        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });

        const fullPath = path.join(outputDir, filename);
        await fs.writeFile(fullPath, buffer);
        
        return fullPath;
    } catch (error) {
        console.error(`Error saving file locally to '${outputDir}/${filename}':`, error.message);
        throw error;
    }
}

/**
 * Read local file
 * @param {string} filePath - Path to local file
 * @returns {Promise<Buffer>} File content as buffer
 */
async function readLocal(filePath) {
    try {
        return await fs.readFile(filePath);
    } catch (error) {
        console.error(`Error reading local file '${filePath}':`, error.message);
        throw error;
    }
}

module.exports = {
    downloadFile,
    downloadFileByPath,
    uploadFile,
    uploadLargeFile,
    saveLocal,
    readLocal
};
