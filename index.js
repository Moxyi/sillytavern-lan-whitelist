// LAN Whitelist Manager Extension
const extensionName = 'sillytavern-lan-whitelist';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const MODULE_NAME = 'lan-whitelist';

const defaultSettings = {
    autoRefresh: true,
    refreshInterval: 5000,
};

let currentSettings = defaultSettings;
let networkInfo = null;
let whitelistEntries = [];
let blockedAttempts = [];
let refreshTimer = null;

function loadSettings() {
    const stored = localStorage.getItem(`st-ext-${MODULE_NAME}-settings`);
    if (stored) {
        currentSettings = { ...defaultSettings, ...JSON.parse(stored) };
    }
}

function saveSettings() {
    localStorage.setItem(`st-ext-${MODULE_NAME}-settings`, JSON.stringify(currentSettings));
}

// 使用现有的 SillyTavern API 端点
async function fetchNetworkInfo() {
    try {
        const response = await fetch('/api/whitelist-info');
        if (!response.ok) {
            // 如果没有这个端点，显示手动添加界面
            return { interfaces: [], message: 'Server does not support network interface detection. Please add IPs manually.' };
        }
        networkInfo = await response.json();
        return networkInfo;
    } catch (error) {
        console.error('[LAN Whitelist] Failed to fetch network info:', error);
        return { interfaces: [], message: 'Unable to detect network interfaces. Please add IPs manually.' };
    }
}

async function fetchWhitelist() {
    try {
        const response = await fetch('/api/whitelist-entries');
        if (!response.ok) throw new Error('Failed to fetch whitelist');
        const data = await response.json();
        whitelistEntries = data.entries || [];
        return whitelistEntries;
    } catch (error) {
        console.error('[LAN Whitelist] Failed to fetch whitelist:', error);
        whitelistEntries = ['Unable to fetch whitelist entries'];
        return [];
    }
}

async function fetchBlockedAttempts() {
    try {
        const response = await fetch('/api/blocked-attempts');
        if (!response.ok) throw new Error('Failed to fetch blocked attempts');
        const data = await response.json();
        blockedAttempts = data.attempts || [];
        return blockedAttempts;
    } catch (error) {
        console.error('[LAN Whitelist] Failed to fetch blocked attempts:', error);
        return [];
    }
}

async function addToWhitelist(ip) {
    try {
        const response = await fetch('/api/add-to-whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add IP to whitelist');
        }

        toastr.success(`IP ${ip} added to whitelist. Restart SillyTavern for changes to take effect.`);
        await refreshData();
    } catch (error) {
        console.error('[LAN Whitelist] Failed to add to whitelist:', error);
        toastr.error(error.message);
    }
}

async function addSubnetToWhitelist(subnet) {
    await addToWhitelist(subnet);
}

async function clearBlockedAttempts() {
    try {
        const response = await fetch('/api/clear-blocked-attempts', {
            method: 'POST',
        });

        if (!response.ok) throw new Error('Failed to clear blocked attempts');
        toastr.success('Blocked attempts cleared');
        await refreshData();
    } catch (error) {
        console.error('[LAN Whitelist] Failed to clear blocked attempts:', error);
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
        const msg = networkInfo?.message || 'No network interfaces detected';
        container.innerHTML = `<div class="notice">${msg}</div>`;
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
                <button class="menu_button subnet-btn" data-subnet="${iface.subnet}">
                    Add subnet ${iface.subnet}
                </button>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.subnet-btn').forEach(btn => {
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
        html += `<div class="whitelist-entry"><span class="entry-ip">${entry}</span></div>`;
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
                <button class="menu_button approve-btn" data-ip="${ip}">Approve</button>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const ip = e.target.getAttribute('data-ip');
            if (ip) addToWhitelist(ip);
        });
    });
}

function setupEventHandlers() {
    const refreshBtn = document.getElementById('lan_whitelist_refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshData);
    }

    const clearBtn = document.getElementById('lan_whitelist_clear_blocked');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearBlockedAttempts);
    }

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
    if (refreshTimer) clearInterval(refreshTimer);
    if (currentSettings.autoRefresh) {
        refreshTimer = setInterval(refreshData, currentSettings.refreshInterval || 5000);
    }
}

function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

// Initialize extension
jQuery(async () => {
    try {
        console.log('[LAN Whitelist] Initializing extension...');

        loadSettings();

        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);
        $('#extensions_settings').append(settingsHtml);

        setupEventHandlers();
        await refreshData();
        startAutoRefresh();

        console.log('[LAN Whitelist] Extension initialized successfully');
    } catch (error) {
        console.error('[LAN Whitelist] Error during initialization:', error);
        toastr.error('LAN Whitelist Manager failed to load. Check console for details.');
    }
});

window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
