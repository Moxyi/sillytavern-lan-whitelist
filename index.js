import { getRequestHeaders, saveSettingsDebounced, eventSource, event_types } from '../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../extensions.js';

const MODULE_NAME = 'lan-whitelist';
const API_BASE = '/api/whitelist-manager';

const defaultSettings = {
    autoRefresh: true,
    refreshInterval: 5000,
};

let networkInfo = null;
let whitelistEntries = [];
let blockedAttempts = [];
let refreshTimer = null;

function loadSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
}

function saveSettings() {
    saveSettingsDebounced();
}

async function fetchNetworkInfo() {
    try {
        const response = await fetch(`${API_BASE}/network`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch network info');
        }

        networkInfo = await response.json();
        return networkInfo;
    } catch (error) {
        console.error('Failed to fetch network info:', error);
        return null;
    }
}

async function fetchWhitelist() {
    try {
        const response = await fetch(`${API_BASE}/whitelist`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch whitelist');
        }

        const data = await response.json();
        whitelistEntries = data.entries || [];
        return whitelistEntries;
    } catch (error) {
        console.error('Failed to fetch whitelist:', error);
        return [];
    }
}

async function fetchBlockedAttempts() {
    try {
        const response = await fetch(`${API_BASE}/blocked`, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch blocked attempts');
        }

        const data = await response.json();
        blockedAttempts = data.attempts || [];
        return blockedAttempts;
    } catch (error) {
        console.error('Failed to fetch blocked attempts:', error);
        return [];
    }
}

async function addToWhitelist(ip) {
    try {
        const response = await fetch(`${API_BASE}/whitelist/add`, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ ip }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to add IP to whitelist');
        }

        toastr.success(`IP ${ip} added to whitelist`);
        await refreshData();
    } catch (error) {
        console.error('Failed to add to whitelist:', error);
        toastr.error(error.message);
    }
}

async function addSubnetToWhitelist(subnet) {
    try {
        const response = await fetch(`${API_BASE}/whitelist/add`, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ ip: subnet }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to add subnet to whitelist');
        }

        toastr.success(`Subnet ${subnet} added to whitelist`);
        await refreshData();
    } catch (error) {
        console.error('Failed to add subnet to whitelist:', error);
        toastr.error(error.message);
    }
}

async function clearBlockedAttempts() {
    try {
        const response = await fetch(`${API_BASE}/blocked/clear`, {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to clear blocked attempts');
        }

        toastr.success('Blocked attempts cleared');
        await refreshData();
    } catch (error) {
        console.error('Failed to clear blocked attempts:', error);
        toastr.error(error.message);
    }
}

async function refreshData() {
    await Promise.all([
        fetchNetworkInfo(),
        fetchWhitelist(),
        fetchBlockedAttempts(),
    ]);

    renderUI();
}

function renderUI() {
    renderNetworkInfo();
    renderWhitelist();
    renderBlockedAttempts();
}

function renderNetworkInfo() {
    const container = document.getElementById('lan_whitelist_network_info');
    if (!container) return;

    if (!networkInfo || !networkInfo.interfaces || networkInfo.interfaces.length === 0) {
        container.innerHTML = '<div class="notice">No network interfaces found. Make sure server-side API is configured.</div>';
        return;
    }

    let html = '<div class="network-interfaces">';

    for (const iface of networkInfo.interfaces) {
        html += `
            <div class="network-interface">
                <div>
                    <div class="interface-name">${iface.name}</div>
                    <div class="interface-ip">${iface.address}</div>
                </div>
                <button class="menu_button" data-subnet="${iface.subnet}">
                    Add subnet ${iface.subnet}
                </button>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;

    // Bind events after rendering
    container.querySelectorAll('button[data-subnet]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const subnet = e.target.getAttribute('data-subnet');
            if (subnet) addSubnetToWhitelist(subnet);
        });
    });
}

function renderWhitelist() {
    const container = document.getElementById('lan_whitelist_entries');
    if (!container) return;

    if (whitelistEntries.length === 0) {
        container.innerHTML = '<div class="notice">No whitelist entries</div>';
        return;
    }

    let html = '<div class="whitelist-entries">';

    for (const entry of whitelistEntries) {
        html += `
            <div class="whitelist-entry">
                <span class="entry-ip">${entry}</span>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

function renderBlockedAttempts() {
    const container = document.getElementById('lan_whitelist_blocked');
    if (!container) return;

    if (blockedAttempts.length === 0) {
        container.innerHTML = '<div class="notice">No blocked attempts</div>';
        return;
    }

    let html = '<div class="blocked-attempts">';

    for (const attempt of blockedAttempts) {
        const ip = attempt.forwardedIp || attempt.clientIp;
        html += `
            <div class="blocked-attempt">
                <div class="attempt-info">
                    <div class="attempt-ip">${ip}</div>
                    <div class="attempt-time">${new Date(attempt.lastSeen).toLocaleString()}</div>
                    <div class="attempt-count">Attempts: ${attempt.count}</div>
                </div>
                <button class="menu_button" data-ip="${ip}">
                    Approve
                </button>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;

    // Bind events after rendering
    container.querySelectorAll('button[data-ip]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const ip = e.target.getAttribute('data-ip');
            if (ip) addToWhitelist(ip);
        });
    });
}

function setupEventHandlers() {
    // Refresh button
    const refreshBtn = document.getElementById('lan_whitelist_refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshData);
    }

    // Clear blocked button
    const clearBtn = document.getElementById('lan_whitelist_clear_blocked');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearBlockedAttempts);
    }

    // Manual add IP button
    const addBtn = document.getElementById('lan_whitelist_add_manual');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const input = document.getElementById('lan_whitelist_manual_ip');
            if (!input || !input.value.trim()) {
                toastr.warning('Please enter an IP address or subnet');
                return;
            }

            await addToWhitelist(input.value.trim());
            input.value = '';
        });
    }
}

function startAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    const settings = extension_settings[MODULE_NAME];
    if (settings && settings.autoRefresh) {
        refreshTimer = setInterval(refreshData, settings.refreshInterval || 5000);
    }
}

function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

async function init() {
    try {
        loadSettings();

        const settingsHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
        const container = document.getElementById('extensions_settings2');

        if (container && settingsHtml) {
            container.insertAdjacentHTML('beforeend', settingsHtml);
        }

        setupEventHandlers();
        await refreshData();
        startAutoRefresh();

        console.log('LAN Whitelist Manager extension loaded successfully');
    } catch (error) {
        console.error('Failed to initialize LAN Whitelist Manager:', error);
        throw error;
    }
}

// Initialize when DOM is ready
jQuery(async () => {
    try {
        await init();
    } catch (error) {
        console.error('LAN Whitelist Manager initialization error:', error);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
