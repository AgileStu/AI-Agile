const fs = require('fs');
const path = require('path');

const clientId = process.env.CYBERSECURE_CLIENT_ID;
const clientSecret = process.env.CYBERSECURE_CLIENT_SECRET;
const authString = process.env.CYBERSECURE_AUTH_STRING;
const baseUrl = process.env.CYBERSECURE_API_URL || 'https://pod300.myconnectsecure.com';

if (!authString && (!clientId || !clientSecret)) {
    console.error('Missing required environment variables:');
    console.error('  Either CYBERSECURE_AUTH_STRING or both CYBERSECURE_CLIENT_ID and CYBERSECURE_CLIENT_SECRET');
    process.exit(1);
}

const BASE_URL = baseUrl.replace(/\/$/, '');

let markdown = '';
let accessToken = null;
let userId = null;

function log(text = '') {
    console.log(text);
    markdown += text + '\n';
}

async function authenticate() {
    // ConnectSecure uses /w/authorize endpoint with Client-Auth-Token header
    const url = `${BASE_URL}/w/authorize`;

    // Build auth string: tenant+clientId:clientSecret then base64 encode
    const tenantName = 'agile-it';
    const rawAuthString = `${tenantName}+${clientId}:${clientSecret}`;
    const clientAuthToken = Buffer.from(rawAuthString).toString('base64');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Client-Auth-Token': clientAuthToken
            }
        });

        if (response.ok) {
            const data = await response.json();
            accessToken = data.access_token;
            userId = data.user_id;
            console.error(`Authenticated successfully. Token expires in ${data.expires_in}s`);
            return true;
        } else {
            const text = await response.text();
            console.error(`Auth failed: ${response.status} - ${text}`);
        }
    } catch (error) {
        console.error(`Auth error: ${error.message}`);
    }

    return false;
}

async function apiRequest(endpoint) {
    const url = `${BASE_URL}${endpoint}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': accessToken,
            'X-USER-ID': userId,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

async function getCompanies() {
    log('\n## Companies\n');

    try {
        const companies = await apiRequest('/r/company/companies');
        const items = Array.isArray(companies) ? companies : (companies.data || companies.result || []);

        if (items.length === 0) {
            log('No companies found');
            return [];
        }

        // Fetch company stats for vulnerability counts
        let companyStats = {};
        try {
            const stats = await apiRequest('/r/company/company_stats');
            const statsItems = Array.isArray(stats) ? stats : (stats.data || stats.result || []);

            for (const stat of statsItems) {
                if (stat.company_id) {
                    companyStats[stat.company_id] = stat;
                }
            }
        } catch (e) {
            console.error(`Could not fetch company stats: ${e.message}`);
        }

        log(`**Total:** ${items.length} company/companies\n`);
        log('| Name | Domain | Assets | Critical | High | Medium | Low |');
        log('|------|--------|--------|----------|------|--------|-----|');

        for (const company of items.slice(0, 50)) {
            const name = company.name || 'N/A';
            const domain = company.domain || 'N/A';
            const stats = companyStats[company.id] || {};
            const totalAssets = stats.total_assets || 0;

            // Extract vulnerability counts from platform_counts (keys: 1=Critical, 2=High, 3=Medium, 4=Low)
            const platformCounts = stats.platform_counts || {};
            let critical = 0, high = 0, medium = 0, low = 0;
            for (const platform of Object.values(platformCounts)) {
                critical += platform['1'] || 0;
                high += platform['2'] || 0;
                medium += platform['3'] || 0;
                low += platform['4'] || 0;
            }

            log(`| ${name} | ${domain} | ${totalAssets} | ${critical} | ${high} | ${medium} | ${low} |`);
        }

        if (items.length > 50) {
            log(`| ... and ${items.length - 50} more | | | | | | |`);
        }

        return items;
    } catch (error) {
        log(`Error getting companies: ${error.message}`);
        return [];
    }
}

async function getAssets() {
    log('\n## Assets\n');

    try {
        const assets = await apiRequest('/r/asset/assets');
        const items = Array.isArray(assets) ? assets : (assets.data || assets.result || []);


        if (items.length === 0) {
            log('No assets found');
            return [];
        }

        log(`**Total:** ${items.length} asset(s)\n`);
        log('| Hostname | OS | IP | Last Seen | Status |');
        log('|----------|----|----|-----------|--------|');

        for (const asset of items.slice(0, 100)) {
            const hostname = asset.host_name || asset.name || asset.visible_name || 'N/A';
            const os = asset.os_name || asset.os_full_name || asset.os || 'N/A';
            const ip = asset.ip || 'N/A';
            const lastSeen = asset.last_discovered_time || asset.last_ping_time || asset.updated;
            const lastSeenStr = lastSeen ? lastSeen.split('T')[0] : 'N/A';
            const statusVal = asset.status ?? asset.scan_status;
            const status = statusVal === true || statusVal === 'true' ? 'Active' : (statusVal === false || statusVal === 'false' ? 'Inactive' : (statusVal || 'N/A'));
            log(`| ${hostname} | ${os} | ${ip} | ${lastSeenStr} | ${status} |`);
        }

        if (items.length > 100) {
            log(`| ... and ${items.length - 100} more | | | |`);
        }

        return items;
    } catch (error) {
        log(`Error getting assets: ${error.message}`);
        return [];
    }
}

async function getVulnerabilities() {
    log('\n## Vulnerabilities\n');

    try {
        // Use problems_summary endpoint for vulnerability data
        const vulns = await apiRequest('/r/report_queries/problems_summary');
        const items = Array.isArray(vulns) ? vulns : (vulns.data || vulns.result || []);

        if (items.length === 0) {
            log('No vulnerabilities found');
            return [];
        }

        // Group by severity
        const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const v of items) {
            const sev = (v.severity || v.risk || v.base_score_label || '').toLowerCase();
            if (sev.includes('critical') || (v.base_score && v.base_score >= 9.0)) bySeverity.critical++;
            else if (sev.includes('high') || (v.base_score && v.base_score >= 7.0)) bySeverity.high++;
            else if (sev.includes('medium') || (v.base_score && v.base_score >= 4.0)) bySeverity.medium++;
            else if (sev.includes('low') || (v.base_score && v.base_score >= 0.1)) bySeverity.low++;
            else bySeverity.info++;
        }

        log(`**Total:** ${items.length} vulnerability/vulnerabilities\n`);
        log('### By Severity\n');
        log('| Severity | Count |');
        log('|----------|-------|');
        log(`| Critical | ${bySeverity.critical} |`);
        log(`| High | ${bySeverity.high} |`);
        log(`| Medium | ${bySeverity.medium} |`);
        log(`| Low | ${bySeverity.low} |`);
        log(`| Info | ${bySeverity.info} |`);

        // Show top vulnerabilities
        log('\n### Top Vulnerabilities\n');
        log('| CVE/Name | Severity | CVSS | Affected Assets |');
        log('|----------|----------|------|-----------------|');

        const sorted = items.sort((a, b) => (b.base_score || 0) - (a.base_score || 0));
        for (const vuln of sorted.slice(0, 20)) {
            const name = vuln.problem_name || vuln.cve || vuln.name || vuln.title || 'N/A';
            const severity = vuln.severity || 'N/A';
            const cvss = vuln.base_score ? vuln.base_score.toFixed(1) : 'N/A';
            const affected = vuln.affected_assets || 'N/A';
            log(`| ${name} | ${severity} | ${cvss} | ${affected} |`);
        }

        if (items.length > 20) {
            log(`| ... and ${items.length - 20} more | | | |`);
        }

        return items;
    } catch (error) {
        log(`Error getting vulnerabilities: ${error.message}`);
        return [];
    }
}

async function main() {
    const timestamp = new Date().toISOString();

    log('# ConnectSecure (CyberSecure) Report');
    log(`\n*Generated: ${timestamp}*\n`);

    // Authenticate first
    console.error('Authenticating...');
    const authenticated = await authenticate();

    if (!authenticated) {
        log('**Error:** Failed to authenticate with ConnectSecure API');
        log('\nPlease verify your CYBERSECURE_CLIENT_ID and CYBERSECURE_CLIENT_SECRET are correct.');
        console.error('Authentication failed');
        process.exit(1);
    }

    await getCompanies();
    await getAssets();
    await getVulnerabilities();

    // Save to markdown file
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'cybersecure-report.md');
    fs.writeFileSync(outputPath, markdown);
    console.log(`\n--- Output saved to: ${outputPath} ---`);
}

main().catch(console.error);
