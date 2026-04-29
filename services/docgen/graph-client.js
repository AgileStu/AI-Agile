const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');

/**
 * Create an authenticated Microsoft Graph client
 * @param {string} tenantId - Azure AD tenant ID
 * @param {string} clientId - Azure AD application (client) ID
 * @param {string} clientSecret - Azure AD client secret
 * @returns {Client} Microsoft Graph client
 */
function createGraphClient(tenantId, clientId, clientSecret) {
    if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Missing required credentials: tenantId, clientId, or clientSecret');
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default']
    });

    return Client.initWithMiddleware({ authProvider });
}

/**
 * Create Graph client from environment variables
 * @returns {Client} Microsoft Graph client
 */
function createGraphClientFromEnv() {
    const tenantId = process.env.MS_TENANT_ID;
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        console.error('Missing required environment variables:');
        if (!tenantId) console.error('  - MS_TENANT_ID');
        if (!clientId) console.error('  - MS_CLIENT_ID');
        if (!clientSecret) console.error('  - MS_CLIENT_SECRET');
        throw new Error('Missing environment variables for MS Graph authentication');
    }

    return createGraphClient(tenantId, clientId, clientSecret);
}

module.exports = {
    createGraphClient,
    createGraphClientFromEnv
};
