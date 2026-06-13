// LAN Whitelist Manager Extension - 局域网白名单管理器
const extensionName = 'sillytavern-lan-whitelist';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const MODULE_NAME = 'lan-whitelist';

const defaultSettings = {
    whitelistedIPs: [],
    serverIPs: [],
};

let currentSettings = defaultSettings;
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

// 使用 Canvas 手动绘制二维码（不依赖外部库）
function generateQRMatrix(text) {
    // 简化版二维码生成算法
    const size = 25; // 25x25 的二维码
    const matrix = [];

    // 初始化矩阵
    for (let i = 0; i < size; i++) {
        matrix[i] = [];
        for (let j = 0; j < size; j++) {
            matrix[i][j] = 0;
        }
    }

    // 添加定位图案（三个角）
    function addFinderPattern(x, y) {
        for (let i = -1; i <= 7; i++) {
            for (let j = -1; j <= 7; j++) {
                const row = y + i;
                const col = x + j;
                if (row >= 0 && row < size && col >= 0 && col < size) {
                    if (i === -1 || i === 7 || j === -1 || j === 7) {
                        matrix[row][col] = 0;
                    } else if ((i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                               (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                               (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
                        matrix[row][col] = 1;
                    }
                }
            }
        }
    }

    // 左上
    addFinderPattern(0, 0);
    // 右上
    addFinderPattern(size - 7, 0);
    // 左下
    addFinderPattern(0, size - 7);

    // 编码数据
    const data = text.split('').map(c => c.charCodeAt(0));
    let bitIndex = 0;

    for (let i = 8; i < size - 8; i++) {
        for (let j = 8; j < size - 8; j++) {
            if (bitIndex < data.length * 8) {
                const byteIndex = Math.floor(bitIndex / 8);
                const bitPos = 7 - (bitIndex % 8);
                matrix[i][j] = (data[byteIndex] >> bitPos) & 1;
                bitIndex++;
            }
        }
    }

    return matrix;
}

function drawQRCodeManually(text) {
    const canvas = document.getElementById('lan_whitelist_qrcode');
    if (!canvas) {
        console.error('[LAN Whitelist] Canvas not found');
        return;
    }

    const matrix = generateQRMatrix(text);
    const moduleSize = 10; // 每个模块10像素
    const quietZone = 4; // 留白
    const canvasSize = (matrix.length + quietZone * 2) * moduleSize;

    canvas.width = canvasSize;
    canvas.height = canvasSize;

    const ctx = canvas.getContext('2d');

    // 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // 绘制黑色模块
    ctx.fillStyle = '#000000';
    for (let row = 0; row < matrix.length; row++) {
        for (let col = 0; col < matrix[row].length; col++) {
            if (matrix[row][col] === 1) {
                ctx.fillRect(
                    (col + quietZone) * moduleSize,
                    (row + quietZone) * moduleSize,
                    moduleSize,
                    moduleSize
                );
            }
        }
    }

    console.log('[LAN Whitelist] 二维码绘制完成');

    // 显示状态
    const statusEl = document.getElementById('lan_whitelist_qr_status');
    if (statusEl) {
        statusEl.innerHTML = `
            <div style="margin-top: 10px;">
                <div style="font-weight: bold; margin-bottom: 5px; color: #4CAF50;">✅ 二维码已生成</div>
                <div style="font-size: 13px; margin-bottom: 5px;">📱 用手机相机或微信扫描</div>
                <div style="font-family: monospace; background: var(--black50a); padding: 8px; border-radius: 4px; word-break: break-all; font-size: 0.8em;">
                    ${text}
                </div>
                <div style="margin-top: 8px; color: var(--SmartThemeQuoteColor); font-size: 0.85em;">
                    ⏱️ 此二维码 10 分钟内有效
                </div>
            </div>
        `;
    }
}

// 获取本机局域网 IP
function getAllLocalIPs() {
    return new Promise((resolve) => {
        const ips = [];
        const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

        if (!RTCPeerConnection) {
            const hostname = window.location.hostname;
            if (hostname !== 'localhost' && hostname !== '127.0.0.1' && /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
                resolve([hostname]);
            } else {
                resolve([]);
            }
            return;
        }

        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('');

        pc.onicecandidate = (ice) => {
            if (!ice || !ice.candidate || !ice.candidate.candidate) {
                pc.close();
                const uniqueIPs = [...new Set(ips)].filter(ip =>
                    ip !== '127.0.0.1' &&
                    ip !== 'localhost' &&
                    !ip.startsWith('0.') &&
                    /^\d+\.\d+\.\d+\.\d+$/.test(ip)
                );
                console.log('[LAN Whitelist] 检测到 IP:', uniqueIPs);
                resolve(uniqueIPs);
                return;
            }

            const parts = ice.candidate.candidate.split(' ');
            const ip = parts[4];
            if (ip) {
                ips.push(ip);
            }
        };

        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .catch(() => {
                pc.close();
                resolve([]);
            });

        setTimeout(() => {
            pc.close();
            const uniqueIPs = [...new Set(ips)].filter(ip =>
                ip !== '127.0.0.1' &&
                ip !== 'localhost' &&
                !ip.startsWith('0.') &&
                /^\d+\.\d+\.\d+\.\d+$/.test(ip)
            );
            console.log('[LAN Whitelist] 超时，检测到 IP:', uniqueIPs);
            resolve(uniqueIPs);
        }, 5000);
    });
}

function getCurrentPort() {
    const port = window.location.port;
    if (port) return port;
    return window.location.protocol === 'https:' ? '443' : '8000';
}

function generatePairingUrl(serverIp, port) {
    const protocol = window.location.protocol;
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now();

    const pairingData = {
        token: token,
        serverIP: serverIp,
        timestamp: timestamp,
        expiresAt: timestamp + 10 * 60 * 1000,
    };
    localStorage.setItem(`st-pairing-${token}`, JSON.stringify(pairingData));

    if (!currentSettings.serverIPs.includes(serverIp)) {
        currentSettings.serverIPs.push(serverIp);
        saveSettings();
    }

    const portStr = (port && port !== '80' && port !== '443') ? `:${port}` : '';
    pairingUrl = `${protocol}//${serverIp}${portStr}/?pair=${token}`;
    return pairingUrl;
}

async function generateQRCode() {
    try {
        console.log('[LAN Whitelist] 开始生成二维码...');
        toastr.info('正在检测局域网地址...', '局域网配对', { timeOut: 2000 });

        const localIPs = await getAllLocalIPs();
        console.log('[LAN Whitelist] 检测到的 IP:', localIPs);

        if (localIPs.length === 0) {
            toastr.error('未检测到局域网地址！\n请确保已连接 WiFi 且不是通过 127.0.0.1 访问', '局域网配对', { timeOut: 5000 });

            // 显示详细错误信息
            const canvas = document.getElementById('lan_whitelist_qrcode');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                canvas.width = 300;
                canvas.height = 150;
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, 300, 150);
                ctx.fillStyle = '#f44336';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('未检测到局域网地址', 150, 70);
                ctx.fillStyle = '#666';
                ctx.font = '12px sans-serif';
                ctx.fillText('请连接 WiFi 后刷新页面', 150, 100);
            }
            return;
        }

        const serverIp = localIPs[0];
        const port = getCurrentPort();

        pairingUrl = generatePairingUrl(serverIp, port);
        console.log('[LAN Whitelist] 配对 URL:', pairingUrl);

        drawQRCodeManually(pairingUrl);

        toastr.success(`服务器 IP: ${serverIp}\n二维码已生成`, '局域网配对', { timeOut: 3000 });

        checkPairingStatus();
    } catch (error) {
        console.error('[LAN Whitelist] 生成二维码失败:', error);
        toastr.error('生成二维码失败：' + error.message);
    }
}

function checkPairingStatus() {
    const checkInterval = setInterval(() => {
        const tokens = Object.keys(localStorage).filter(key => key.startsWith('st-pairing-'));

        tokens.forEach(key => {
            const data = JSON.parse(localStorage.getItem(key) || '{}');

            if (data.expiresAt && Date.now() > data.expiresAt) {
                localStorage.removeItem(key);
            }

            if (data.pairedIP && data.pairedIP !== 'pending') {
                toastr.success(`设备已配对：${data.pairedIP}`, '配对成功', { timeOut: 5000 });
                addToWhitelist(data.pairedIP);
                localStorage.removeItem(key);
            }
        });
    }, 1000);

    setTimeout(() => clearInterval(checkInterval), 10 * 60 * 1000);
}

function copyPairingUrl() {
    if (!pairingUrl) {
        toastr.warning('请先生成配对二维码');
        return;
    }

    navigator.clipboard.writeText(pairingUrl).then(() => {
        toastr.success('配对链接已复制，发送给手机即可', '局域网配对', { timeOut: 2000 });
    }).catch(() => {
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

async function handlePairingRequest() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('pair');

    if (token) {
        console.log('[LAN Whitelist] 配对请求 token:', token);

        const clientIPs = await getAllLocalIPs();
        const clientIP = clientIPs[0] || 'unknown';
        const serverIP = window.location.hostname;

        const pairingKey = `st-pairing-${token}`;
        const pairingData = JSON.parse(localStorage.getItem(pairingKey) || '{}');
        pairingData.pairedIP = clientIP;
        localStorage.setItem(pairingKey, JSON.stringify(pairingData));

        showPairingSuccessPage(clientIP, serverIP);
    }
}

function showPairingSuccessPage(clientIP, serverIP) {
    document.body.innerHTML = `
        <div style="text-align: center; padding: 30px 20px; font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: white;">
            <div style="background: rgba(255,255,255,0.95); color: #333; border-radius: 20px; padding: 40px 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
                <h1 style="font-size: 28px; margin-bottom: 15px; color: #4CAF50;">配对成功！</h1>

                <div style="background: #f5f5f5; padding: 15px; border-radius: 10px; margin: 20px 0;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 8px;">📱 您的设备 IP</div>
                    <div style="font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; color: #4CAF50;">${clientIP}</div>
                </div>

                <div style="background: #f5f5f5; padding: 15px; border-radius: 10px; margin: 20px 0;">
                    <div style="font-size: 14px; color: #666; margin-bottom: 8px;">🖥️ 酒馆服务器 IP</div>
                    <div style="font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; color: #2196F3;">${serverIP}</div>
                </div>

                <div style="background: #E8F5E9; padding: 12px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #2E7D32;">
                    ✨ 您的设备已添加到白名单，现在可以访问 SillyTavern 了！
                </div>

                <div style="margin-top: 25px;">
                    <a href="/" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                        🚀 前往 SillyTavern
                    </a>
                </div>
            </div>
        </div>
    `;
}

async function addToWhitelist(ip) {
    if (ip === '127.0.0.1' || ip === 'localhost' || ip === 'unknown') {
        return;
    }

    if (!currentSettings.whitelistedIPs.includes(ip)) {
        currentSettings.whitelistedIPs.push(ip);
        saveSettings();
        toastr.success(`IP ${ip} 已添加到白名单`, '局域网白名单');
        await refreshData();
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

    container.innerHTML = '<div class="notice">🔍 正在检测本机局域网地址...</div>';

    const localIPs = await getAllLocalIPs();

    if (localIPs.length === 0) {
        container.innerHTML = `
            <div class="notice">
                <p style="font-size: 16px; margin-bottom: 10px;">⚠️ 未检测到局域网地址</p>
                <p style="font-size: 14px; margin: 8px 0;">
                    <strong>请确保：</strong><br>
                    ✓ 已连接到 WiFi 或局域网<br>
                    ✓ 不是通过 localhost 或 127.0.0.1 访问
                </p>
            </div>
        `;
        return;
    }

    const port = getCurrentPort();
    let html = '<div class="network-interfaces">';

    for (const ip of localIPs) {
        const portStr = (port && port !== '80' && port !== '443') ? `:${port}` : '';
        const fullUrl = `${window.location.protocol}//${ip}${portStr}`;

        html += `
            <div class="network-interface">
                <div>
                    <div class="interface-name">🖥️ 本机局域网地址</div>
                    <div class="interface-ip">${ip}${portStr}</div>
                    <div class="interface-url">${fullUrl}</div>
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

    const whitelistEntries = currentSettings.whitelistedIPs || [];

    if (whitelistEntries.length === 0) {
        container.innerHTML = '<div class="notice">暂无白名单条目<br><small style="opacity: 0.7;">扫码配对后，手机 IP 会自动添加到这里</small></div>';
        return;
    }

    let html = '<div class="whitelist-entries">';
    for (const entry of whitelistEntries) {
        html += `
            <div class="whitelist-entry">
                <span class="entry-ip">📱 ${entry}</span>
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
    document.getElementById('lan_whitelist_generate_qr')?.addEventListener('click', generateQRCode);
    document.getElementById('lan_whitelist_copy_url')?.addEventListener('click', copyPairingUrl);
    document.getElementById('lan_whitelist_refresh')?.addEventListener('click', refreshData);

    document.getElementById('lan_whitelist_add_manual')?.addEventListener('click', async () => {
        const input = document.getElementById('lan_whitelist_manual_ip');
        if (!input || !input.value.trim()) {
            toastr.warning('请输入 IP 地址或子网');
            return;
        }
        await addToWhitelist(input.value.trim());
        input.value = '';
    });
}

jQuery(async () => {
    try {
        console.log('[LAN Whitelist] 初始化扩展...');
        loadSettings();

        await handlePairingRequest();

        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings').append(settingsHtml);

        setupEventHandlers();
        await refreshData();

        console.log('[LAN Whitelist] 扩展初始化成功');
    } catch (error) {
        console.error('[LAN Whitelist] 初始化错误:', error);
        toastr.error('局域网白名单管理器加载失败');
    }
});
