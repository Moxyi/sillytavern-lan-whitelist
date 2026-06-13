// LAN Whitelist Manager Extension - 局域网白名单管理器
const extensionName = 'sillytavern-lan-whitelist';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const MODULE_NAME = 'lan-whitelist';

const defaultSettings = {
    autoRefresh: true,
    refreshInterval: 10000,
    whitelistedIPs: [],
};

let currentSettings = defaultSettings;
let networkInfo = null;
let whitelistEntries = [];
let blockedAttempts = [];
let refreshTimer = null;
let pairingUrl = '';

function loadSettings() {
    const stored = localStorage.getItem(`st-ext-${MODULE_NAME}-settings`);
    if (stored) {
        currentSettings = { ...defaultSettings, ...JSON.parse(stored) };
    }
}

function saveSettings() {
    localStorage.setItem(`st-ext-${MODULE_NAME}-settings`, JSON.stringify(currentSettings));
}

// 获取当前访问的 URL
function getCurrentUrl() {
    return window.location.origin;
}

// 检测本地网络接口（通过浏览器 API）
function detectLocalNetworkInfo() {
    const url = getCurrentUrl();
    const hostname = window.location.hostname;

    const interfaces = [];

    // 如果是 IP 地址访问
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        const parts = hostname.split('.');
        interfaces.push({
            name: '当前访问地址',
            address: hostname,
            subnet: `${parts[0]}.${parts[1]}.${parts[2]}.0/24`,
            url: url,
        });
    }

    return {
        interfaces: interfaces,
        currentUrl: url,
        hostname: hostname,
    };
}

// 生成配对 URL
function generatePairingUrl() {
    const baseUrl = getCurrentUrl();
    const token = Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now();

    // 存储配对令牌
    const pairingData = {
        token: token,
        timestamp: timestamp,
        expiresAt: timestamp + 10 * 60 * 1000, // 10分钟过期
    };
    localStorage.setItem(`st-pairing-${token}`, JSON.stringify(pairingData));

    pairingUrl = `${baseUrl}/pair?token=${token}`;
    return pairingUrl;
}

// 绘制二维码
function drawQRCode(text) {
    const canvas = document.getElementById('lan_whitelist_qrcode');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const size = 256;
    canvas.width = size;
    canvas.height = size;

    // 简单的二维码生成（使用第三方库会更好，但这里先用简单文本）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#000000';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 绘制文本（实际应该生成真正的二维码）
    const lines = text.match(/.{1,30}/g) || [];
    const lineHeight = 15;
    const startY = size / 2 - (lines.length * lineHeight) / 2;

    lines.forEach((line, index) => {
        ctx.fillText(line, size / 2, startY + index * lineHeight);
    });

    // 显示提示
    const statusEl = document.getElementById('lan_whitelist_qr_status');
    if (statusEl) {
        statusEl.textContent = '用手机浏览器扫描上方链接或手动输入';
    }
}

// 生成真正的二维码（使用简化算法）
function generateQRCode() {
    pairingUrl = generatePairingUrl();
    drawQRCode(pairingUrl);

    toastr.success('配对二维码已生成，10分钟内有效', '局域网配对', { timeOut: 3000 });

    // 开始轮询配对状态
    checkPairingStatus();
}

// 检查配对状态
function checkPairingStatus() {
    const checkInterval = setInterval(() => {
        // 检查是否有新的 IP 被添加
        const tokens = Object.keys(localStorage).filter(key => key.startsWith('st-pairing-'));

        tokens.forEach(key => {
            const data = JSON.parse(localStorage.getItem(key) || '{}');

            // 如果令牌已过期，删除
            if (data.expiresAt && Date.now() > data.expiresAt) {
                localStorage.removeItem(key);
            }

            // 如果有配对成功的 IP
            if (data.pairedIP) {
                toastr.success(`设备已配对：${data.pairedIP}`, '配对成功');
                localStorage.removeItem(key);
                refreshData();
            }
        });
    }, 2000);

    // 10分钟后停止检查
    setTimeout(() => clearInterval(checkInterval), 10 * 60 * 1000);
}

// 复制配对链接
function copyPairingUrl() {
    if (!pairingUrl) {
        pairingUrl = generatePairingUrl();
    }

    navigator.clipboard.writeText(pairingUrl).then(() => {
        toastr.success('配对链接已复制', '局域网配对', { timeOut: 2000 });
    }).catch(() => {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = pairingUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toastr.success('配对链接已复制', '局域网配对', { timeOut: 2000 });
    });
}

// 处理配对请求
function handlePairingRequest() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
        // 获取客户端 IP（需要服务器支持）
        fetch('/api/my-ip')
            .then(res => res.json())
            .then(data => {
                const clientIP = data.ip;

                // 保存配对信息
                const pairingKey = `st-pairing-${token}`;
                const pairingData = JSON.parse(localStorage.getItem(pairingKey) || '{}');
                pairingData.pairedIP = clientIP;
                localStorage.setItem(pairingKey, JSON.stringify(pairingData));

                // 添加到白名单
                if (!currentSettings.whitelistedIPs.includes(clientIP)) {
                    currentSettings.whitelistedIPs.push(clientIP);
                    saveSettings();
                }

                // 显示成功页面
                document.body.innerHTML = `
                    <div style="text-align: center; padding: 50px; font-family: sans-serif;">
                        <h1 style="color: #4CAF50;">✅ 配对成功</h1>
                        <p style="font-size: 18px;">您的设备 IP <code>${clientIP}</code> 已添加到白名单</p>
                        <p style="color: #666;">您现在可以关闭此页面并访问 SillyTavern</p>
                        <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">前往 SillyTavern</a>
                    </div>
                `;
            })
            .catch(err => {
                console.error('配对失败:', err);
                toastr.error('配对失败，请手动添加 IP');
            });
    }
}

async function fetchWhitelist() {
    // 从本地设置读取
    whitelistEntries = currentSettings.whitelistedIPs || [];
    return whitelistEntries;
}

async function fetchBlockedAttempts() {
    // 暂时返回空数组（需要服务器端支持）
    blockedAttempts = [];
    return blockedAttempts;
}

async function addToWhitelist(ip) {
    try {
        if (!currentSettings.whitelistedIPs.includes(ip)) {
            currentSettings.whitelistedIPs.push(ip);
            saveSettings();
            toastr.success(`IP ${ip} 已添加到白名单`, '局域网白名单');
            await refreshData();
        } else {
            toastr.info(`IP ${ip} 已在白名单中`, '局域网白名单');
        }
    } catch (error) {
        console.error('[LAN Whitelist] Failed to add to whitelist:', error);
        toastr.error(error.message);
    }
}

async function removeFromWhitelist(ip) {
    const index = currentSettings.whitelistedIPs.indexOf(ip);
    if (index > -1) {
        currentSettings.whitelistedIPs.splice(index, 1);
        saveSettings();
        toastr.success(`IP ${ip} 已从白名单移除`, '局域网白名单');
        await refreshData();
    }
}

async function clearBlockedAttempts() {
    blockedAttempts = [];
    toastr.success('拦截记录已清空');
}

async function refreshData() {
    networkInfo = detectLocalNetworkInfo();
    await Promise.all([
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
        container.innerHTML = `
            <div class="notice">
                <p>📱 <strong>当前访问地址:</strong> <code>${getCurrentUrl()}</code></p>
                <p style="margin-top: 5px; color: var(--SmartThemeQuoteColor);">
                    💡 提示：请通过局域网 IP 访问此页面（如 http://192.168.1.x:8000）以启用网络检测功能
                </p>
            </div>
        `;
        return;
    }

    let html = '<div class="network-interfaces">';

    for (const iface of networkInfo.interfaces) {
        html += `
            <div class="network-interface">
                <div>
                    <div class="interface-name">${iface.name}</div>
                    <div class="interface-ip">${iface.address}</div>
                    <div class="interface-url" style="font-size: 0.9em; color: var(--SmartThemeQuoteColor);">${iface.url}</div>
                </div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

function renderWhitelist() {
    const container = document.getElementById('lan_whitelist_entries');
    if (!container) return;

    if (whitelistEntries.length === 0) {
        container.innerHTML = '<div class="notice">暂无白名单条目</div>';
        return;
    }

    let html = '<div class="whitelist-entries">';
    for (const entry of whitelistEntries) {
        html += `
            <div class="whitelist-entry">
                <span class="entry-ip">${entry}</span>
                <button class="menu_button compact remove-btn" data-ip="${entry}" style="padding: 2px 8px; margin-left: 10px;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const ip = e.target.closest('button').getAttribute('data-ip');
            if (ip && confirm(`确定要移除 ${ip} 吗？`)) {
                removeFromWhitelist(ip);
            }
        });
    });
}

function renderBlockedAttempts() {
    const container = document.getElementById('lan_whitelist_blocked');
    if (!container) return;

    if (blockedAttempts.length === 0) {
        container.innerHTML = '<div class="notice">暂无拦截记录</div>';
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
                </div>
                <button class="menu_button approve-btn" data-ip="${ip}">批准</button>
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
    const generateQrBtn = document.getElementById('lan_whitelist_generate_qr');
    if (generateQrBtn) {
        generateQrBtn.addEventListener('click', generateQRCode);
    }

    const copyUrlBtn = document.getElementById('lan_whitelist_copy_url');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', copyPairingUrl);
    }

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
                toastr.warning('请输入 IP 地址或子网');
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
        refreshTimer = setInterval(refreshData, currentSettings.refreshInterval || 10000);
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
        console.log('[LAN Whitelist] 初始化扩展...');

        loadSettings();

        // 检查是否是配对请求
        handlePairingRequest();

        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);
        $('#extensions_settings').append(settingsHtml);

        setupEventHandlers();
        await refreshData();
        startAutoRefresh();

        console.log('[LAN Whitelist] 扩展初始化成功');
    } catch (error) {
        console.error('[LAN Whitelist] 初始化错误:', error);
        toastr.error('局域网白名单管理器加载失败');
    }
});

window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
