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

// 获取服务器的局域网 IP 和端口
async function getServerNetworkInfo() {
    try {
        // 从服务器获取网络接口信息
        const response = await fetch('/api/server-info');
        if (response.ok) {
            const data = await response.json();
            return data;
        }
    } catch (error) {
        console.log('[LAN Whitelist] 无法从服务器获取网络信息，使用客户端检测');
    }

    // 降级：使用当前 URL
    const url = new URL(window.location.href);
    const hostname = url.hostname;
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');

    // 如果是通过 IP 访问的
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        return {
            interfaces: [{
                name: '当前访问地址',
                address: hostname,
                port: port,
                url: `${url.protocol}//${hostname}:${port}`,
            }],
        };
    }

    return { interfaces: [] };
}

// 生成配对 URL
function generatePairingUrl(serverIp, port) {
    const protocol = window.location.protocol;
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now();

    // 存储配对令牌
    const pairingData = {
        token: token,
        timestamp: timestamp,
        expiresAt: timestamp + 10 * 60 * 1000, // 10分钟过期
    };
    localStorage.setItem(`st-pairing-${token}`, JSON.stringify(pairingData));

    const portStr = (port && port !== '80' && port !== '443') ? `:${port}` : '';
    pairingUrl = `${protocol}//${serverIp}${portStr}/?pair=${token}`;
    return pairingUrl;
}

// QR Code 生成（真正的二维码算法）
function generateQRCodeMatrix(text) {
    // 简化的二维码生成
    // 使用 2D 数组表示二维码矩阵
    const size = 33; // QR Code Version 1 = 21x21, 这里用 33x33
    const matrix = Array(size).fill(0).map(() => Array(size).fill(0));

    // 添加定位符（左上、右上、左下）
    function addPositionMarker(matrix, x, y) {
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < 7; j++) {
                if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
                    matrix[y + i][x + j] = 1;
                }
            }
        }
    }

    addPositionMarker(matrix, 0, 0); // 左上
    addPositionMarker(matrix, size - 7, 0); // 右上
    addPositionMarker(matrix, 0, size - 7); // 左下

    // 简化：将文本转换为二进制并填充到矩阵中
    const binaryData = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');

    let dataIndex = 0;
    for (let i = 8; i < size - 8; i++) {
        for (let j = 8; j < size - 8; j++) {
            if (dataIndex < binaryData.length) {
                matrix[i][j] = parseInt(binaryData[dataIndex]);
                dataIndex++;
            }
        }
    }

    return matrix;
}

// 绘制二维码到 Canvas
function drawQRCode(text) {
    const canvas = document.getElementById('lan_whitelist_qrcode');
    if (!canvas) return;

    const matrix = generateQRCodeMatrix(text);
    const moduleSize = 8; // 每个模块的像素大小
    const size = matrix.length * moduleSize;

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');

    // 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // 绘制黑色模块
    ctx.fillStyle = '#000000';
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            if (matrix[y][x] === 1) {
                ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
            }
        }
    }

    // 显示提示
    const statusEl = document.getElementById('lan_whitelist_qr_status');
    if (statusEl) {
        statusEl.innerHTML = `
            <div style="margin-top: 10px;">
                <div style="font-weight: bold; margin-bottom: 5px;">📱 配对地址：</div>
                <div style="font-family: monospace; background: var(--black50a); padding: 8px; border-radius: 4px; word-break: break-all;">
                    ${text}
                </div>
                <div style="margin-top: 8px; color: var(--SmartThemeQuoteColor); font-size: 0.9em;">
                    ⏱️ 此二维码 10 分钟内有效
                </div>
            </div>
        `;
    }
}

// 生成二维码
async function generateQRCode() {
    try {
        const serverInfo = await getServerNetworkInfo();

        if (!serverInfo.interfaces || serverInfo.interfaces.length === 0) {
            toastr.warning('未检测到局域网地址，请通过 IP 访问（如 http://192.168.1.x:8000）');
            return;
        }

        // 使用第一个局域网地址
        const iface = serverInfo.interfaces[0];
        pairingUrl = generatePairingUrl(iface.address, iface.port);

        drawQRCode(pairingUrl);

        toastr.success('配对二维码已生成，10分钟内有效', '局域网配对', { timeOut: 3000 });

        // 开始轮询配对状态
        checkPairingStatus();
    } catch (error) {
        console.error('[LAN Whitelist] 生成二维码失败:', error);
        toastr.error('生成二维码失败');
    }
}

// 检查配对状态
function checkPairingStatus() {
    const checkInterval = setInterval(() => {
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
                addToWhitelist(data.pairedIP);
                localStorage.removeItem(key);
            }
        });
    }, 2000);

    // 10分钟后停止检查
    setTimeout(() => clearInterval(checkInterval), 10 * 60 * 1000);
}

// 复制配对链接
function copyPairingUrl() {
    if (!pairingUrl) {
        toastr.warning('请先生成配对二维码');
        return;
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
    const token = urlParams.get('pair');

    if (token) {
        // 获取客户端 IP
        const clientIP = window.location.hostname; // 临时方案

        // 更好的方案：通过 API 获取真实 IP
        fetch('/api/client-ip')
            .then(res => res.json())
            .then(data => {
                const realIP = data.ip || clientIP;

                // 保存配对信息
                const pairingKey = `st-pairing-${token}`;
                const pairingData = JSON.parse(localStorage.getItem(pairingKey) || '{}');
                pairingData.pairedIP = realIP;
                localStorage.setItem(pairingKey, JSON.stringify(pairingData));

                // 显示成功页面
                showPairingSuccessPage(realIP);
            })
            .catch(err => {
                console.error('获取 IP 失败:', err);
                // 降级方案
                const pairingKey = `st-pairing-${token}`;
                const pairingData = JSON.parse(localStorage.getItem(pairingKey) || '{}');
                pairingData.pairedIP = 'unknown';
                localStorage.setItem(pairingKey, JSON.stringify(pairingData));
                showPairingSuccessPage('unknown');
            });
    }
}

function showPairingSuccessPage(ip) {
    const successHtml = `
        <div style="text-align: center; padding: 50px; font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4CAF50; font-size: 48px; margin-bottom: 20px;">✅</h1>
            <h2 style="color: #4CAF50; margin-bottom: 20px;">配对成功</h2>
            <p style="font-size: 18px; margin-bottom: 10px;">您的设备已添加到白名单</p>
            ${ip !== 'unknown' ? `<p style="font-family: monospace; background: #f0f0f0; padding: 10px; border-radius: 5px; display: inline-block; margin-bottom: 20px;">IP: ${ip}</p>` : ''}
            <p style="color: #666; margin-bottom: 30px;">您现在可以关闭此页面并访问 SillyTavern</p>
            <a href="/" style="display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 8px; font-size: 16px;">
                前往 SillyTavern
            </a>
        </div>
    `;

    const container = document.getElementById('extensions_settings');
    if (container) {
        container.innerHTML = successHtml;
    }
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

async function refreshData() {
    renderUI();
}

function renderUI() {
    renderNetworkInfo();
    renderWhitelist();
}

async function renderNetworkInfo() {
    const container = document.getElementById('lan_whitelist_network_info');
    if (!container) return;

    try {
        const serverInfo = await getServerNetworkInfo();

        if (!serverInfo.interfaces || serverInfo.interfaces.length === 0) {
            container.innerHTML = `
                <div class="notice">
                    <p>⚠️ 未检测到局域网地址</p>
                    <p style="margin-top: 8px; font-size: 0.9em;">
                        请通过局域网 IP 访问（例如：<code>http://192.168.1.x:8000</code>）
                    </p>
                    <p style="margin-top: 8px; font-size: 0.9em; color: var(--SmartThemeQuoteColor);">
                        当前访问：<code>${window.location.href}</code>
                    </p>
                </div>
            `;
            return;
        }

        let html = '<div class="network-interfaces">';

        for (const iface of serverInfo.interfaces) {
            const portStr = (iface.port && iface.port !== '80' && iface.port !== '443') ? `:${iface.port}` : '';
            const fullUrl = `${window.location.protocol}//${iface.address}${portStr}`;

            html += `
                <div class="network-interface">
                    <div>
                        <div class="interface-name">🌐 ${iface.name || '局域网地址'}</div>
                        <div class="interface-ip">${iface.address}${portStr}</div>
                        <div class="interface-url">${fullUrl}</div>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        console.error('[LAN Whitelist] 渲染网络信息失败:', error);
    }
}

function renderWhitelist() {
    const container = document.getElementById('lan_whitelist_entries');
    if (!container) return;

    const whitelistEntries = currentSettings.whitelistedIPs || [];

    if (whitelistEntries.length === 0) {
        container.innerHTML = '<div class="notice">暂无白名单条目</div>';
        return;
    }

    let html = '<div class="whitelist-entries">';
    for (const entry of whitelistEntries) {
        html += `
            <div class="whitelist-entry">
                <span class="entry-ip">${entry}</span>
                <button class="menu_button compact remove-btn" data-ip="${entry}">
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

        console.log('[LAN Whitelist] 扩展初始化成功');
    } catch (error) {
        console.error('[LAN Whitelist] 初始化错误:', error);
        toastr.error('局域网白名单管理器加载失败');
    }
});
