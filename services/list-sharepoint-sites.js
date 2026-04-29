const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');
const fs = require('fs');
const path = require('path');

const tenantId = process.env.MS_TENANT_ID;
const clientId = process.env.MS_CLIENT_ID;
const clientSecret = process.env.MS_CLIENT_SECRET;

if (!tenantId || !clientId || !clientSecret) {
    console.error('Missing required environment variables:');
    if (!tenantId) console.error('  - MS_TENANT_ID');
    if (!clientId) console.error('  - MS_CLIENT_ID');
    if (!clientSecret) console.error('  - MS_CLIENT_SECRET');
    process.exit(1);
}

// Create credential and Graph client
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
});

const graphClient = Client.initWithMiddleware({ authProvider });

// Markdown output collector
let markdown = '';

function log(text = '') {
    console.log(text);
    markdown += text + '\n';
}

async function getAppPermissions() {
    log('\n## Application Permissions\n');

    try {
        const servicePrincipals = await graphClient
            .api('/servicePrincipals')
            .filter(`appId eq '${clientId}'`)
            .select('id,displayName,appId,appRoles')
            .get();

        if (servicePrincipals.value.length === 0) {
            log('Service principal not found for this app');
            return [];
        }

        const sp = servicePrincipals.value[0];
        log(`- **App:** ${sp.displayName}`);
        log(`- **App ID:** ${sp.appId}`);
        log(`- **Service Principal ID:** ${sp.id}`);
        log('');

        const appRoleAssignments = await graphClient
            .api(`/servicePrincipals/${sp.id}/appRoleAssignments`)
            .get();

        if (appRoleAssignments.value.length === 0) {
            log('No application permissions assigned');
            return [];
        }

        const graphSp = await graphClient
            .api('/servicePrincipals')
            .filter("displayName eq 'Microsoft Graph'")
            .select('appRoles')
            .get();

        const graphAppRoles = graphSp.value[0]?.appRoles || [];
        const permissions = [];

        log('### Assigned Permissions\n');
        log('| Permission | Description |');
        log('|------------|-------------|');

        for (const assignment of appRoleAssignments.value) {
            const role = graphAppRoles.find(r => r.id === assignment.appRoleId);
            const roleName = role ? role.value : assignment.appRoleId;
            const roleDesc = role ? role.displayName : 'Unknown';
            log(`| ${roleName} | ${roleDesc} |`);
            permissions.push({ name: roleName, description: roleDesc });
        }

        return permissions;
    } catch (error) {
        log(`Error getting app permissions: ${error.message}`);
        if (error.statusCode === 403) {
            log('\n> Note: Reading app permissions requires Application.Read.All permission');
        }
        return [];
    }
}

async function getAllSharePointSites() {
    log('\n## SharePoint Sites\n');

    try {
        let sites = [];
        let response = await graphClient
            .api('/sites')
            .select('id,name,displayName,webUrl,createdDateTime')
            .top(100)
            .get();

        sites = sites.concat(response.value);

        while (response['@odata.nextLink']) {
            response = await graphClient.api(response['@odata.nextLink']).get();
            sites = sites.concat(response.value);
        }

        if (sites.length === 0) {
            log('No SharePoint sites found (or no permission to view them)');
            return [];
        }

        log(`**Total:** ${sites.length} site(s)\n`);
        log('| Name | URL | Created |');
        log('|------|-----|---------|');

        for (const site of sites) {
            const name = site.displayName || site.name;
            const created = site.createdDateTime ? site.createdDateTime.split('T')[0] : 'N/A';
            log(`| ${name} | ${site.webUrl} | ${created} |`);
        }

        // Root site
        log('\n### Root Site\n');
        const rootSite = await graphClient
            .api('/sites/root')
            .select('id,name,displayName,webUrl')
            .get();

        log(`- **Name:** ${rootSite.displayName || rootSite.name}`);
        log(`- **URL:** ${rootSite.webUrl}`);
        log(`- **ID:** ${rootSite.id}`);

        return sites;
    } catch (error) {
        log(`Error getting SharePoint sites: ${error.message}`);
        if (error.statusCode === 403) {
            log('\n> Note: Listing sites requires Sites.Read.All or Sites.ReadWrite.All permission');
        }
        return [];
    }
}

async function main() {
    const timestamp = new Date().toISOString();

    log('# SharePoint Sites Report');
    log(`\n*Generated: ${timestamp}*\n`);
    log(`- **Tenant ID:** ${tenantId}`);
    log(`- **Client ID:** ${clientId}`);

    await getAppPermissions();
    await getAllSharePointSites();

    // Save to markdown file
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'sharepoint-sites.md');
    fs.writeFileSync(outputPath, markdown);
    console.log(`\n--- Output saved to: ${outputPath} ---`);
}

main().catch(console.error);
