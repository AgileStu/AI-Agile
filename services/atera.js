const fs = require('fs');
const path = require('path');

const apiKey = process.env.ATERA_API_KEY;

if (!apiKey) {
    console.error('Missing required environment variable: ATERA_API_KEY');
    process.exit(1);
}

const BASE_URL = 'https://app.atera.com/api/v3';

// Markdown output collector
let markdown = '';

function log(text = '') {
    console.log(text);
    markdown += text + '\n';
}

async function apiRequest(endpoint) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
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
        const response = await apiRequest(`${endpoint}${separator}page=${page}&itemsInPage=50`);

        if (response.items && Array.isArray(response.items)) {
            allItems = allItems.concat(response.items);
        }

        // Check if there are more pages
        if (response.totalPages && page < response.totalPages) {
            page++;
        } else {
            hasMore = false;
        }
    }

    return allItems;
}

async function getCustomers() {
    log('\n## Customers\n');

    try {
        const customers = await getAllPages('/customers');

        if (customers.length === 0) {
            log('No customers found');
            return [];
        }

        log(`**Total:** ${customers.length} customer(s)\n`);
        log('| ID | Name | Created |');
        log('|----|------|---------|');

        for (const customer of customers) {
            const created = customer.CreatedOn ? customer.CreatedOn.split('T')[0] : 'N/A';
            log(`| ${customer.CustomerID} | ${customer.CustomerName} | ${created} |`);
        }

        return customers;
    } catch (error) {
        log(`Error getting customers: ${error.message}`);
        return [];
    }
}

async function getAgents() {
    log('\n## Agents\n');

    try {
        const agents = await getAllPages('/agents');

        if (agents.length === 0) {
            log('No agents found');
            return [];
        }

        log(`**Total:** ${agents.length} agent(s)\n`);
        log('| Machine Name | Customer | OS | Status | Last Seen |');
        log('|--------------|----------|-----|--------|-----------|');

        for (const agent of agents) {
            const lastSeen = agent.LastSeen ? agent.LastSeen.replace('T', ' ').substring(0, 16) : 'N/A';
            const os = agent.OSType || 'Unknown';
            const status = agent.Online ? 'Online' : 'Offline';
            const customer = agent.CustomerName || 'N/A';
            log(`| ${agent.MachineName || 'N/A'} | ${customer} | ${os} | ${status} | ${lastSeen} |`);
        }

        return agents;
    } catch (error) {
        log(`Error getting agents: ${error.message}`);
        return [];
    }
}

async function getAlerts() {
    log('\n## Alerts\n');

    try {
        // Only get first page of alerts to avoid timeout
        const response = await apiRequest('/alerts?page=1&itemsInPage=50');
        const alerts = response.items || [];

        if (alerts.length === 0) {
            log('No alerts found');
            return [];
        }

        // Separate open and closed alerts
        const openAlerts = alerts.filter(a => !a.Resolved);
        const closedAlerts = alerts.filter(a => a.Resolved);

        log(`**Total:** ${alerts.length} alert(s) (${openAlerts.length} open, ${closedAlerts.length} resolved)\n`);

        if (openAlerts.length > 0) {
            log('### Open Alerts\n');
            log('| ID | Severity | Device | Title | Created |');
            log('|----|----------|--------|-------|---------|');

            for (const alert of openAlerts) {
                const created = alert.Created ? alert.Created.split('T')[0] : 'N/A';
                const severity = alert.Severity || 'N/A';
                const device = alert.DeviceName || alert.MachineName || 'N/A';
                const title = (alert.Title || alert.AlertMessage || 'N/A').substring(0, 50);
                log(`| ${alert.AlertID} | ${severity} | ${device} | ${title} | ${created} |`);
            }
            log('');
        }

        return alerts;
    } catch (error) {
        log(`Error getting alerts: ${error.message}`);
        return [];
    }
}

async function getTickets() {
    log('\n## Tickets\n');

    try {
        const tickets = await getAllPages('/tickets');

        if (tickets.length === 0) {
            log('No tickets found');
            return [];
        }

        // Separate open and closed tickets
        const openTickets = tickets.filter(t => t.TicketStatus !== 'Closed' && t.TicketStatus !== 'Resolved');

        log(`**Total:** ${tickets.length} ticket(s) (${openTickets.length} open)\n`);

        // Count open tickets by customer
        const ticketsByCustomer = {};
        for (const ticket of openTickets) {
            const customer = ticket.CustomerName || 'Unassigned';
            ticketsByCustomer[customer] = (ticketsByCustomer[customer] || 0) + 1;
        }

        log('### Open Tickets by Customer\n');
        log('| Customer | Open Tickets |');
        log('|----------|--------------|');
        const sortedCustomers = Object.entries(ticketsByCustomer).sort((a, b) => b[1] - a[1]);
        for (const [customer, count] of sortedCustomers) {
            log(`| ${customer} | ${count} |`);
        }
        log('');

        if (openTickets.length > 0) {
            log('### Recent Open Tickets\n');
            log('| ID | Priority | Customer | Title | Created |');
            log('|----|----------|----------|-------|---------|');

            for (const ticket of openTickets.slice(0, 30)) { // Limit to 30 most recent
                const created = ticket.TicketCreatedDate ? ticket.TicketCreatedDate.split('T')[0] : 'N/A';
                const priority = ticket.TicketPriority || 'N/A';
                const customer = ticket.CustomerName || 'N/A';
                const title = (ticket.TicketTitle || 'N/A').substring(0, 50);
                log(`| ${ticket.TicketID} | ${priority} | ${customer} | ${title} | ${created} |`);
            }
            log('');
        }

        return tickets;
    } catch (error) {
        log(`Error getting tickets: ${error.message}`);
        return [];
    }
}

async function getAgentHealthSummary(agents) {
    log('\n## Agent Health Summary\n');

    if (!agents || agents.length === 0) {
        log('No agent data available\n');
        return;
    }

    const now = new Date();
    const STALE_DAYS = 7;
    const staleThreshold = new Date(now.getTime() - (STALE_DAYS * 24 * 60 * 60 * 1000));

    // Count online/offline
    const online = agents.filter(a => a.Online).length;
    const offline = agents.filter(a => !a.Online).length;

    log('### Status Overview\n');
    log('| Status | Count | % |');
    log('|--------|-------|---|');
    log(`| Online | ${online} | ${((online / agents.length) * 100).toFixed(1)}% |`);
    log(`| Offline | ${offline} | ${((offline / agents.length) * 100).toFixed(1)}% |`);
    log('');

    // Count by OS
    const byOS = {};
    for (const agent of agents) {
        const os = agent.OSType || 'Unknown';
        byOS[os] = (byOS[os] || 0) + 1;
    }

    log('### By Operating System\n');
    log('| OS | Count |');
    log('|----|-------|');
    for (const [os, count] of Object.entries(byOS).sort((a, b) => b[1] - a[1])) {
        log(`| ${os} | ${count} |`);
    }
    log('');

    // Stale agents - agents that haven't been seen in 7+ days
    const staleAgents = [];
    for (const agent of agents) {
        if (agent.LastSeen) {
            const lastSeen = new Date(agent.LastSeen);
            if (lastSeen < staleThreshold) {
                const daysSince = Math.floor((now - lastSeen) / (24 * 60 * 60 * 1000));
                staleAgents.push({
                    name: agent.MachineName || 'N/A',
                    customer: agent.CustomerName || 'N/A',
                    lastSeen: agent.LastSeen.split('T')[0],
                    daysSince
                });
            }
        }
    }

    log(`### Stale Agents (No contact in ${STALE_DAYS}+ days)\n`);
    if (staleAgents.length === 0) {
        log('✅ All agents have checked in within the last 7 days.\n');
    } else {
        staleAgents.sort((a, b) => b.daysSince - a.daysSince);
        log(`⚠️ **${staleAgents.length} stale agent(s) detected**\n`);
        log('| Machine Name | Customer | Last Seen | Days Stale |');
        log('|--------------|----------|-----------|------------|');
        for (const agent of staleAgents.slice(0, 30)) {
            log(`| ${agent.name} | ${agent.customer} | ${agent.lastSeen} | ${agent.daysSince} |`);
        }
        if (staleAgents.length > 30) {
            log(`| ... and ${staleAgents.length - 30} more | | | |`);
        }
        log('');
    }

    // By customer
    const byCustomer = {};
    for (const agent of agents) {
        const customer = agent.CustomerName || 'Unknown';
        if (!byCustomer[customer]) {
            byCustomer[customer] = { total: 0, online: 0, offline: 0 };
        }
        byCustomer[customer].total++;
        if (agent.Online) {
            byCustomer[customer].online++;
        } else {
            byCustomer[customer].offline++;
        }
    }

    log('### Agents by Customer\n');
    log('| Customer | Total | Online | Offline |');
    log('|----------|-------|--------|---------|');
    for (const [customer, stats] of Object.entries(byCustomer).sort((a, b) => b[1].total - a[1].total)) {
        log(`| ${customer} | ${stats.total} | ${stats.online} | ${stats.offline} |`);
    }
    log('');
}

async function main() {
    const timestamp = new Date().toISOString();

    log('# Atera Report');
    log(`\n*Generated: ${timestamp}*\n`);

    const customers = await getCustomers();
    const agents = await getAgents();
    await getAgentHealthSummary(agents);
    await getAlerts();
    await getTickets();

    // Save to markdown file
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'atera-report.md');
    fs.writeFileSync(outputPath, markdown);
    console.log(`\n--- Output saved to: ${outputPath} ---`);
}

main().catch(console.error);
