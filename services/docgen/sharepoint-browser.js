/**
 * SharePoint browser utilities
 * Functions for browsing SharePoint sites, drives, and folders
 */

/**
 * List all SharePoint sites
 * @param {Client} client - MS Graph client
 * @returns {Promise<Array>} List of sites
 */
async function listSites(client) {
    try {
        const response = await client.api('/sites?search=*')
            .select('id,displayName,name,webUrl')
            .top(100)
            .get();
        return response.value || [];
    } catch (error) {
        console.error('Error listing sites:', error.message);
        throw error;
    }
}

/**
 * Get a SharePoint site by path (e.g., "sites/Templates")
 * @param {Client} client - MS Graph client
 * @param {string} sitePath - Site path (e.g., "sites/Templates")
 * @returns {Promise<Object>} Site object with id, displayName, webUrl
 */
async function getSiteByPath(client, sitePath) {
    try {
        // Extract domain from environment or use default
        const domain = process.env.MS_DOMAIN || 'yourdomain.sharepoint.com';
        const response = await client.api(`/sites/${domain}:/${sitePath}`)
            .select('id,displayName,name,webUrl')
            .get();
        return response;
    } catch (error) {
        console.error(`Error getting site by path '${sitePath}':`, error.message);
        throw error;
    }
}

/**
 * Get site by ID
 * @param {Client} client - MS Graph client
 * @param {string} siteId - SharePoint site ID
 * @returns {Promise<Object>} Site object
 */
async function getSiteById(client, siteId) {
    try {
        const response = await client.api(`/sites/${siteId}`)
            .select('id,displayName,name,webUrl')
            .get();
        return response;
    } catch (error) {
        console.error(`Error getting site by ID '${siteId}':`, error.message);
        throw error;
    }
}

/**
 * List all document libraries (drives) in a site
 * @param {Client} client - MS Graph client
 * @param {string} siteId - SharePoint site ID
 * @returns {Promise<Array>} List of drives
 */
async function getDrives(client, siteId) {
    try {
        const response = await client.api(`/sites/${siteId}/drives`)
            .select('id,name,webUrl,driveType')
            .get();
        return response.value || [];
    } catch (error) {
        console.error('Error getting drives:', error.message);
        throw error;
    }
}

/**
 * List contents of a folder
 * @param {Client} client - MS Graph client
 * @param {string} siteId - SharePoint site ID
 * @param {string} driveId - Drive ID
 * @param {string} folderPath - Folder path (use 'root' or '/' for root folder)
 * @returns {Promise<Array>} List of items in folder
 */
async function listFolder(client, siteId, driveId, folderPath = 'root') {
    try {
        let apiPath;
        if (folderPath === 'root' || folderPath === '/') {
            apiPath = `/sites/${siteId}/drives/${driveId}/root/children`;
        } else {
            // Remove leading slash if present
            const cleanPath = folderPath.startsWith('/') ? folderPath.substring(1) : folderPath;
            apiPath = `/sites/${siteId}/drives/${driveId}/root:/${cleanPath}:/children`;
        }

        const response = await client.api(apiPath)
            .select('id,name,webUrl,file,folder,size,lastModifiedDateTime')
            .get();
        return response.value || [];
    } catch (error) {
        console.error(`Error listing folder '${folderPath}':`, error.message);
        throw error;
    }
}

/**
 * Filter items by file extensions
 * @param {Array} items - List of SharePoint items
 * @param {Array<string>} extensions - Array of extensions (e.g., ['.docx', '.pdf'])
 * @returns {Array} Filtered items
 */
function filterByType(items, extensions) {
    return items.filter(item => {
        if (!item.file) return false; // Skip folders
        const name = item.name.toLowerCase();
        return extensions.some(ext => name.endsWith(ext.toLowerCase()));
    });
}

/**
 * Find files by name pattern
 * @param {Client} client - MS Graph client
 * @param {string} siteId - SharePoint site ID
 * @param {string} driveId - Drive ID
 * @param {string} searchQuery - Search query
 * @returns {Promise<Array>} Matching items
 */
async function searchFiles(client, siteId, driveId, searchQuery) {
    try {
        const response = await client.api(`/sites/${siteId}/drives/${driveId}/root/search(q='${searchQuery}')`)
            .select('id,name,webUrl,file,folder,size,lastModifiedDateTime')
            .get();
        return response.value || [];
    } catch (error) {
        console.error(`Error searching files with query '${searchQuery}':`, error.message);
        throw error;
    }
}

module.exports = {
    listSites,
    getSiteByPath,
    getSiteById,
    getDrives,
    listFolder,
    filterByType,
    searchFiles
};
