const fs = require('fs');
const path = require('path');

const apiKey = process.env.HUNTRESS_API_KEY;
const apiSecret = process.env.HUNTRESS_API_SECRET;

if (!apiKey || !apiSecret) {
    console.error('Missing required environment variables:');
    if (!apiKey) console.error('  - HUNTRESS_API_KEY');
    if (!apiSecret) console.error('  - HUNTRESS_API_SECRET');
    process.exit(1);
}

const BASE_URL = 'https://api.huntress.io/v1';
const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

// Markdown output collector
let markdown = '';

function log(text = '') {
    console.log(text);
    markdown += text + '\n';
}

async function apiRequest(endpoint) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
            'Authorization': authHeader,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

async function getAllPages(endpoint, dataKey = null) {
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const separator = endpoint.includes('?') ? '&' : '?';
        const response = await apiRequest(`${endpoint}${separator}page=${page}&limit=100`);

        // Huntress API returns data under specific keys (organizations, agents, etc.)
        let items = [];
        if (dataKey && response[dataKey]) {
            items = response[dataKey];
        } else if (response.data && Array.isArray(response.data)) {
            items = response.data;
        } else if (Array.isArray(response)) {
            items = response;
        } else {
            // Try to find the first array property in the response
            for (const key of Object.keys(response)) {
                if (Array.isArray(response[key])) {
                    items = response[key];
                    break;
                }
            }
        }

        allData = allData.concat(items);

        // Check pagination
        if (response.pagination && response.pagination.next_page) {
            page++;
        } else {
            hasMore = false;
        }
    }

    return allData;
}

async function getOrganizations() {
    log('\n## Organizations\n');

    try {
        const organizations = await getAllPages('/organizations', 'organizations');

        if (organizations.length === 0) {
            log('No organizations found');
            return [];
        }

        log(`**Total:** ${organizations.length} organization(s)\n`);
        log('| ID | Name | Created |');
        log('|----|------|---------|');

        for (const org of organizations) {
            const created = org.created_at ? org.created_at.split('T')[0] : 'N/A';
            log(`| ${org.id} | ${org.name} | ${created} |`);
        }

        return organizations;
    } catch (error) {
        log(`Error getting organizations: ${error.message}`);
        return [];
    }
}

async function getAgentsForOrg(orgId, orgName) {
    try {
        const agents = await getAllPages(`/agents?organization_id=${orgId}`, 'agents');
        return { orgId, orgName, agents };
    } catch (error) {
        console.error(`Error getting agents for ${orgName}: ${error.message}`);
        return { orgId, orgName, agents: [], error: error.message };
    }
}

async function getIncidentReportsForOrg(orgId, orgName) {
    try {
        const reports = await getAllPages(`/incident_reports?organization_id=${orgId}`, 'incident_reports');
        return { orgId, orgName, reports };
    } catch (error) {
        console.error(`Error getting incident reports for ${orgName}: ${error.message}`);
        return { orgId, orgName, reports: [], error: error.message };
    }
}

async function getAllAgents(organizations) {
    log('\n## Agents by Organization\n');

    let totalAgents = 0;
    const allAgentData = [];

    for (const org of organizations) {
        const result = await getAgentsForOrg(org.id, org.name);
        allAgentData.push(result);

        if (result.error) {
            log(`### ${org.name}\n`);
            log(`> Error: ${result.error}\n`);
            continue;
        }

        if (result.agents.length === 0) {
            log(`### ${org.name}\n`);
            log('No agents found\n');
            continue;
        }

        totalAgents += result.agents.length;
        log(`### ${org.name} (${result.agents.length} agents)\n`);
        log('| Hostname | OS | Version | External IP | Internal IP | Last Callback | Defender |');
        log('|----------|-----|---------|-------------|-------------|---------------|----------|');

        for (const agent of result.agents) {
            const lastCallback = agent.last_callback_at ? agent.last_callback_at.replace('T', ' ').substring(0, 16) : 'N/A';
            const os = agent.os || agent.platform || 'Unknown';
            const version = agent.version || 'N/A';
            const externalIp = agent.external_ip || 'N/A';
            const internalIp = agent.ipv4_address || 'N/A';
            const defender = agent.defender_status || 'N/A';
            log(`| ${agent.hostname || 'N/A'} | ${os} | ${version} | ${externalIp} | ${internalIp} | ${lastCallback} | ${defender} |`);
        }
        log('');
    }

    log(`\n**Total Agents:** ${totalAgents}\n`);

    return allAgentData;
}

async function getAgentHealthSummary(allAgentData) {
    log('\n## Agent Health Summary\n');

    const now = new Date();
    const STALE_DAYS = 7;
    const staleThreshold = new Date(now.getTime() - (STALE_DAYS * 24 * 60 * 60 * 1000));

    // Aggregate health statistics
    const healthStats = {};
    const staleAgents = [];
    let totalAgents = 0;

    for (const orgData of allAgentData) {
        if (!orgData.agents) continue;

        for (const agent of orgData.agents) {
            totalAgents++;

            // Count by defender status
            const status = agent.defender_status || 'Unknown';
            healthStats[status] = (healthStats[status] || 0) + 1;

            // Check for stale agents
            if (agent.last_callback_at) {
                const lastCallback = new Date(agent.last_callback_at);
                if (lastCallback < staleThreshold) {
                    const daysSince = Math.floor((now - lastCallback) / (24 * 60 * 60 * 1000));
                    staleAgents.push({
                        org: orgData.orgName,
                        hostname: agent.hostname || 'N/A',
                        os: agent.os || agent.platform || 'Unknown',
                        lastCallback: agent.last_callback_at.split('T')[0],
                        daysSince: daysSince
                    });
                }
            }
        }
    }

    // Health status summary
    log('### Defender Status\n');
    log('| Status | Count | % |');
    log('|--------|-------|---|');
    for (const [status, count] of Object.entries(healthStats).sort((a, b) => b[1] - a[1])) {
        const pct = ((count / totalAgents) * 100).toFixed(1);
        log(`| ${status} | ${count} | ${pct}% |`);
    }
    log('');

    // Stale agents
    log(`### Stale Agents (No callback in ${STALE_DAYS}+ days)\n`);
    if (staleAgents.length === 0) {
        log('✅ All agents have checked in within the last 7 days.\n');
    } else {
        // Sort by days since last callback (most stale first)
        staleAgents.sort((a, b) => b.daysSince - a.daysSince);

        log(`⚠️ **${staleAgents.length} stale agent(s) detected**\n`);
        log('| Organization | Hostname | OS | Last Callback | Days Stale |');
        log('|--------------|----------|-----|---------------|------------|');
        for (const agent of staleAgents) {
            log(`| ${agent.org} | ${agent.hostname} | ${agent.os} | ${agent.lastCallback} | ${agent.daysSince} |`);
        }
        log('');
    }

    // Summary by organization
    log('### Health by Organization\n');
    log('| Organization | Total | Protected | Unhealthy | Other |');
    log('|--------------|-------|-----------|-----------|-------|');

    for (const orgData of allAgentData) {
        if (!orgData.agents || orgData.agents.length === 0) continue;

        const orgStats = { Protected: 0, Unhealthy: 0, Other: 0 };
        for (const agent of orgData.agents) {
            const status = agent.defender_status || 'Unknown';
            if (status === 'Protected') {
                orgStats.Protected++;
            } else if (status === 'Unhealthy') {
                orgStats.Unhealthy++;
            } else {
                orgStats.Other++;
            }
        }
        log(`| ${orgData.orgName} | ${orgData.agents.length} | ${orgStats.Protected} | ${orgStats.Unhealthy} | ${orgStats.Other} |`);
    }
    log('');
}

async function getAllIncidentReports(organizations) {
    log('\n## Incident Reports by Organization\n');

    let totalReports = 0;
    const allIncidentData = [];

    for (const org of organizations) {
        const result = await getIncidentReportsForOrg(org.id, org.name);
        allIncidentData.push(result);

        if (result.error) {
            log(`### ${org.name}\n`);
            log(`> Error: ${result.error}\n`);
            continue;
        }

        if (result.reports.length === 0) {
            log(`### ${org.name}\n`);
            log('No incident reports\n');
            continue;
        }

        totalReports += result.reports.length;
        log(`### ${org.name} (${result.reports.length} reports)\n`);
        log('| ID | Status | Severity | Sent | Closed | Subject |');
        log('|----|--------|----------|------|--------|---------|');

        for (const report of result.reports) {
            const sent = report.sent_at ? report.sent_at.split('T')[0] : 'N/A';
            const closed = report.closed_at ? report.closed_at.split('T')[0] : 'Open';
            const subject = (report.subject || report.summary || 'N/A').substring(0, 60);
            const severity = report.severity || 'N/A';
            const status = report.status || 'N/A';
            log(`| ${report.id} | ${status} | ${severity} | ${sent} | ${closed} | ${subject} |`);
        }
        log('');
    }

    log(`\n**Total Incident Reports:** ${totalReports}\n`);

    return allIncidentData;
}

async function getThreatSummary(allIncidentData) {
    log('\n## Threat Summary\n');

    // Aggregate threat statistics
    const stats = {
        total: 0,
        open: 0,
        closed: 0,
        bySeverity: { critical: 0, high: 0, low: 0 },
        byIndicatorType: {},
        indicatorCounts: {
            footholds: 0,
            process_detections: 0,
            antivirus_detections: 0,
            ransomware_canaries: 0,
            monitored_files: 0,
            managed_identity: 0
        }
    };

    for (const orgData of allIncidentData) {
        for (const report of orgData.reports) {
            stats.total++;

            if (report.status === 'closed') {
                stats.closed++;
            } else {
                stats.open++;
            }

            const severity = (report.severity || 'unknown').toLowerCase();
            if (stats.bySeverity[severity] !== undefined) {
                stats.bySeverity[severity]++;
            }

            // Count indicator types
            if (report.indicator_types && Array.isArray(report.indicator_types)) {
                for (const type of report.indicator_types) {
                    stats.byIndicatorType[type] = (stats.byIndicatorType[type] || 0) + 1;
                }
            }

            // Sum indicator counts
            if (report.indicator_counts) {
                for (const [key, value] of Object.entries(report.indicator_counts)) {
                    if (stats.indicatorCounts[key] !== undefined && typeof value === 'number') {
                        stats.indicatorCounts[key] += value;
                    }
                }
            }
        }
    }

    log('### Overall Statistics\n');
    log(`| Metric | Count |`);
    log(`|--------|-------|`);
    log(`| Total Incidents | ${stats.total} |`);
    log(`| Open | ${stats.open} |`);
    log(`| Closed | ${stats.closed} |`);
    log('');

    log('### By Severity\n');
    log(`| Severity | Count |`);
    log(`|----------|-------|`);
    log(`| Critical | ${stats.bySeverity.critical} |`);
    log(`| High | ${stats.bySeverity.high} |`);
    log(`| Low | ${stats.bySeverity.low} |`);
    log('');

    log('### By Indicator Type\n');
    log(`| Indicator Type | Count |`);
    log(`|----------------|-------|`);
    for (const [type, count] of Object.entries(stats.byIndicatorType).sort((a, b) => b[1] - a[1])) {
        log(`| ${type} | ${count} |`);
    }
    log('');

    log('### Detection Counts\n');
    log(`| Detection Type | Total |`);
    log(`|----------------|-------|`);
    for (const [type, count] of Object.entries(stats.indicatorCounts)) {
        if (count > 0) {
            log(`| ${type.replace(/_/g, ' ')} | ${count} |`);
        }
    }
    log('');

    // Show open/critical incidents that need attention
    const openCritical = [];
    for (const orgData of allIncidentData) {
        for (const report of orgData.reports) {
            if (report.status !== 'closed' && (report.severity === 'critical' || report.severity === 'high')) {
                openCritical.push({
                    org: orgData.orgName,
                    id: report.id,
                    severity: report.severity,
                    subject: report.subject || report.summary || 'N/A',
                    sent: report.sent_at ? report.sent_at.split('T')[0] : 'N/A'
                });
            }
        }
    }

    if (openCritical.length > 0) {
        log('### ⚠️ Open Critical/High Incidents Requiring Attention\n');
        log(`| Organization | ID | Severity | Sent | Subject |`);
        log(`|--------------|-----|----------|------|---------|`);
        for (const incident of openCritical) {
            log(`| ${incident.org} | ${incident.id} | ${incident.severity} | ${incident.sent} | ${incident.subject.substring(0, 40)} |`);
        }
        log('');
    } else {
        log('### ✅ No Open Critical/High Incidents\n');
    }
}

async function main() {
    const timestamp = new Date().toISOString();

    log('# Huntress Report');
    log(`\n*Generated: ${timestamp}*\n`);

    const organizations = await getOrganizations();

    if (organizations.length > 0) {
        const agentData = await getAllAgents(organizations);
        await getAgentHealthSummary(agentData);
        const incidentData = await getAllIncidentReports(organizations);
        await getThreatSummary(incidentData);
    }

    // Save to markdown file
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'huntress-report.md');
    fs.writeFileSync(outputPath, markdown);
    console.log(`\n--- Output saved to: ${outputPath} ---`);
}

main().catch(console.error);
