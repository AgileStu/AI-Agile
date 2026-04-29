const fs = require('fs');
const path = require('path');

const apiUrl = process.env.DROPSUITE_API_URL;
const authToken = process.env.DROPSUITE_API_AUTHENTICATION_TOKEN;
const resellerToken = process.env.DROPSUITE_API_RESELLER_TOKEN;

if (!apiUrl || !authToken || !resellerToken) {
    console.error('Missing required environment variables:');
    if (!apiUrl) console.error('  - DROPSUITE_API_URL');
    if (!authToken) console.error('  - DROPSUITE_API_AUTHENTICATION_TOKEN');
    if (!resellerToken) console.error('  - DROPSUITE_API_RESELLER_TOKEN');
    process.exit(1);
}

const BASE_URL = apiUrl.replace(/\/$/, '');

let markdown = '';

function log(text = '') {
    console.log(text);
    markdown += text + '\n';
}

async function apiRequest(endpoint) {
    const url = `${BASE_URL}${endpoint}`;

    const response = await fetch(url, {
        headers: {
            'X-Reseller-Token': resellerToken,
            'X-Access-Token': authToken,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

async function getAllPages(endpoint) {
    let allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const separator = endpoint.includes('?') ? '&' : '?';
        try {
            const response = await apiRequest(`${endpoint}${separator}page=${page}`);

            // Handle Dropsuite response format with result_set
            let items = [];
            if (response.result_set && Array.isArray(response.result_set)) {
                items = response.result_set;
            } else if (Array.isArray(response)) {
                items = response;
            }

            allItems = allItems.concat(items);

            // Check pagination - Dropsuite uses next_link instead of total_pages
            if (response.pagination) {
                if (!response.pagination.next_link) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else if (items.length === 0) {
                hasMore = false;
            } else {
                page++;
            }
        } catch (error) {
            if (page === 1) throw error;
            hasMore = false;
        }
    }

    return allItems;
}

async function fetchForTenant(tenantAuthToken, endpoint) {
    try {
        const url = `${BASE_URL}${endpoint}`;
        const response = await fetch(url, {
            headers: {
                'X-Reseller-Token': resellerToken,
                'X-Access-Token': tenantAuthToken,
                'Accept': 'application/json'
            }
        });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : (data.result_set || []);
    } catch {
        return [];
    }
}

async function getTenantData(tenant) {
    const token = tenant.authentication_token;

    // Fetch all service data in parallel
    const [accounts, onedrives, sharepoints, teams] = await Promise.all([
        fetchForTenant(token, '/accounts'),
        fetchForTenant(token, '/onedrives'),
        fetchForTenant(token, '/sharepoints/domains'),
        fetchForTenant(token, '/teams_and_groups/domains')
    ]);

    // Calculate Exchange storage
    let exchangeStorage = 0;
    let exchangeCount = accounts.length;
    let lastBackup = null;
    for (const account of accounts) {
        exchangeStorage += account.storage || 0;
        if (account.last_backup) {
            const d = new Date(account.last_backup);
            if (!lastBackup || d > lastBackup) lastBackup = d;
        }
    }

    // Calculate OneDrive storage
    let onedriveStorage = 0;
    let onedriveCount = onedrives.length;
    let onedriveFiles = 0;
    for (const drive of onedrives) {
        onedriveStorage += drive.storage || 0;
        onedriveFiles += drive.file_count || 0;
        if (drive.last_backup) {
            const d = new Date(drive.last_backup);
            if (!lastBackup || d > lastBackup) lastBackup = d;
        }
    }

    // Calculate SharePoint storage
    let sharepointStorage = 0;
    let sharepointSites = 0;
    let sharepointFiles = 0;
    for (const sp of sharepoints) {
        sharepointStorage += sp.storage || 0;
        sharepointSites += sp.site_count || 0;
        sharepointFiles += sp.file_count || 0;
        if (sp.last_backup) {
            const d = new Date(sp.last_backup);
            if (!lastBackup || d > lastBackup) lastBackup = d;
        }
    }

    // Teams groups count (no storage field)
    let teamsGroups = 0;
    for (const t of teams) {
        teamsGroups += t.group_count || 0;
    }

    return {
        exchange: { storage: exchangeStorage, count: exchangeCount },
        onedrive: { storage: onedriveStorage, count: onedriveCount, files: onedriveFiles },
        sharepoint: { storage: sharepointStorage, sites: sharepointSites, files: sharepointFiles },
        teams: { groups: teamsGroups },
        totalStorage: exchangeStorage + onedriveStorage + sharepointStorage,
        lastBackup
    };
}

async function getTenants() {
    log('\n## Tenants / Organizations\n');

    try {
        const tenants = await getAllPages('/users');

        if (tenants.length === 0) {
            log('No tenants found');
            return [];
        }

        log(`**Total:** ${tenants.length} tenant(s)\n`);
        log('| Organization | Exchange | OneDrive | SharePoint | Total | Last Backup |');
        log('|--------------|----------|----------|------------|-------|-------------|');

        // Fetch all data for each tenant
        for (const tenant of tenants) {
            const data = await getTenantData(tenant);

            // Store calculated values on tenant for summary
            tenant.data = data;

            const org = tenant.organization_name || tenant.email || 'N/A';
            const exchange = formatBytes(data.exchange.storage);
            const onedrive = formatBytes(data.onedrive.storage);
            const sharepoint = formatBytes(data.sharepoint.storage);
            const total = formatBytes(data.totalStorage);
            const lastBackupStr = data.lastBackup ? data.lastBackup.toISOString().split('T')[0] : 'N/A';

            log(`| ${org} | ${exchange} | ${onedrive} | ${sharepoint} | ${total} | ${lastBackupStr} |`);
        }

        return tenants;
    } catch (error) {
        log(`Error getting tenants: ${error.message}`);
        return [];
    }
}

async function getAccounts() {
    log('\n## Backup Accounts\n');

    try {
        const accounts = await getAllPages('/accounts');

        if (accounts.length === 0) {
            log('No backup accounts found');
            return [];
        }

        log(`**Total:** ${accounts.length} account(s)\n`);
        log('| Email | Status | Storage | Last Backup |');
        log('|-------|--------|---------|-------------|');

        for (const account of accounts.slice(0, 100)) {
            const storage = account.storage_used ? formatBytes(account.storage_used) : 'N/A';
            const status = account.backup_status || account.status || 'N/A';
            const lastBackup = account.last_backup_at ? account.last_backup_at.split('T')[0] : 'N/A';
            log(`| ${account.email || 'N/A'} | ${status} | ${storage} | ${lastBackup} |`);
        }

        if (accounts.length > 100) {
            log(`| ... and ${accounts.length - 100} more | | | |`);
        }

        return accounts;
    } catch (error) {
        log(`Error getting accounts: ${error.message}`);
        return [];
    }
}

async function getOneDrives() {
    log('\n## OneDrive Backups\n');

    try {
        const drives = await getAllPages('/onedrives');

        if (drives.length === 0) {
            log('No OneDrive backups found');
            return [];
        }

        log(`**Total:** ${drives.length} OneDrive backup(s)\n`);
        log('| Email | Status | Files | Storage |');
        log('|-------|--------|-------|---------|');

        for (const drive of drives.slice(0, 50)) {
            const storage = drive.storage_used ? formatBytes(drive.storage_used) : 'N/A';
            const status = drive.backup_status || drive.status || 'N/A';
            const files = drive.files_count || drive.total_files || 'N/A';
            log(`| ${drive.email || 'N/A'} | ${status} | ${files} | ${storage} |`);
        }

        if (drives.length > 50) {
            log(`| ... and ${drives.length - 50} more | | | |`);
        }

        return drives;
    } catch (error) {
        log(`Error getting OneDrive backups: ${error.message}`);
        return [];
    }
}

async function getSharePointDomains() {
    log('\n## SharePoint Domains\n');

    try {
        const domains = await getAllPages('/sharepoints/domains');

        if (domains.length === 0) {
            log('No SharePoint domains found');
            return [];
        }

        log(`**Total:** ${domains.length} domain(s)\n`);
        log('| ID | Domain | Sites | Status |');
        log('|----|--------|-------|--------|');

        for (const domain of domains) {
            const sites = domain.sites_count || domain.total_sites || 'N/A';
            const status = domain.backup_status || domain.status || 'N/A';
            log(`| ${domain.id || 'N/A'} | ${domain.domain_name || domain.name || 'N/A'} | ${sites} | ${status} |`);
        }

        return domains;
    } catch (error) {
        log(`Error getting SharePoint domains: ${error.message}`);
        return [];
    }
}

async function getTeamsAndGroups() {
    log('\n## Teams & Groups\n');

    try {
        const domains = await getAllPages('/teams_and_groups/domains');

        if (domains.length === 0) {
            log('No Teams & Groups domains found');
            return [];
        }

        log(`**Total:** ${domains.length} domain(s)\n`);
        log('| ID | Domain | Teams | Status |');
        log('|----|--------|-------|--------|');

        for (const domain of domains) {
            const teams = domain.teams_count || domain.total_teams || 'N/A';
            const status = domain.backup_status || domain.status || 'N/A';
            log(`| ${domain.id || 'N/A'} | ${domain.domain_name || domain.name || 'N/A'} | ${teams} | ${status} |`);
        }

        return domains;
    } catch (error) {
        log(`Error getting Teams & Groups: ${error.message}`);
        return [];
    }
}

async function getSummary(tenants) {
    log('\n## Summary\n');

    if (tenants && tenants.length > 0) {
        let totalSeats = 0;
        let totalSeatsAvailable = 0;
        let totalExchange = 0;
        let totalOneDrive = 0;
        let totalSharePoint = 0;
        let totalExchangeAccounts = 0;
        let totalOneDriveAccounts = 0;
        let totalSharePointSites = 0;
        let totalTeamsGroups = 0;

        for (const tenant of tenants) {
            totalSeats += tenant.seats_used || 0;
            totalSeatsAvailable += tenant.seats_available || 0;
            if (tenant.data) {
                totalExchange += tenant.data.exchange.storage;
                totalOneDrive += tenant.data.onedrive.storage;
                totalSharePoint += tenant.data.sharepoint.storage;
                totalExchangeAccounts += tenant.data.exchange.count;
                totalOneDriveAccounts += tenant.data.onedrive.count;
                totalSharePointSites += tenant.data.sharepoint.sites;
                totalTeamsGroups += tenant.data.teams.groups;
            }
        }

        const totalStorage = totalExchange + totalOneDrive + totalSharePoint;

        log('### Overview\n');
        log('| Metric | Value |');
        log('|--------|-------|');
        log(`| Total Tenants | ${tenants.length} |`);
        log(`| Total Seats Used/Available | ${totalSeats}/${totalSeatsAvailable} |`);
        log(`| Exchange Mailboxes | ${totalExchangeAccounts} |`);
        log(`| OneDrive Accounts | ${totalOneDriveAccounts} |`);
        log(`| SharePoint Sites | ${totalSharePointSites} |`);
        log(`| Teams Groups | ${totalTeamsGroups} |`);
        log('');

        log('### Storage Breakdown\n');
        log('| Service | Storage |');
        log('|---------|---------|');
        log(`| Exchange | ${formatBytes(totalExchange)} |`);
        log(`| OneDrive | ${formatBytes(totalOneDrive)} |`);
        log(`| SharePoint | ${formatBytes(totalSharePoint)} |`);
        log(`| **Total** | **${formatBytes(totalStorage)}** |`);
        log('');
    }

}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
    const timestamp = new Date().toISOString();

    log('# Dropsuite Report');
    log(`\n*Generated: ${timestamp}*\n`);

    const tenants = await getTenants();
    await getSummary(tenants);

    // Save to markdown file
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'dropsuite-report.md');
    fs.writeFileSync(outputPath, markdown);
    console.log(`\n--- Output saved to: ${outputPath} ---`);
}

main().catch(console.error);
