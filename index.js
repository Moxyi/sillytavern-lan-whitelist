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

// 加载 qrcode-generator 库 (真正成熟的开源库)
async function loadQRCodeLibrary() {
    if (window.qrcode) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // 使用 qrcode-generator，一个成熟的日本开源 QR 码库
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
        script.onload = () => {
            console.log('[LAN Whitelist] QR 码库加载成功');
            resolve();
        };
        script.onerror = () => {
            // 降级到另一个 CDN
            const script2 = document.createElement('script');
            script2.src = 'https://unpkg.com/qrcode-generator@1.4.4/qrcode.min.js';
            script2.onload = () => {
                console.log('[LAN Whitelist] QR 码库加载成功（备用源）');
                resolve();
            };
            script2.onerror = reject;
            document.head.appendChild(script2);
        };
        document.head.appendChild(script);
    });
}

// 使用 qrcode-generator 绘制真正的二维码
async function drawQRCode(text) {
    const container = document.getElementById('lan_whitelist_qrcode');
    if (!container) {
        console.error('[LAN Whitelist] 找不到二维码容器');
        return;
    }

    try {
        console.log('[LAN Whitelist] 开始加载 QR 码库...');
        await loadQRCodeLibrary();

        if (!window.qrcode) {
            throw new Error('QR 码库未加载');
        }

        console.log('[LAN Whitelist] 开始生成二维码，内容:', text);

        // 创建二维码对象
        const qr = window.qrcode(0, 'H'); // 类型 0（自动），纠错级别 H（最高）
        qr.addData(text);
        qr.make();

        // 清空容器
        container.innerHTML = '';

        // 创建 Canvas
        const canvas = document.createElement('canvas');
        const moduleCount = qr.getModuleCount();
        const cellSize = 8; // 每个模块 8 像素
        const margin = 4; // 4 个模块的边距
        const size = (moduleCount + margin * 2) * cellSize;

        canvas.width = size;
        canvas.height = size;
        canvas.style.border = '2px solid var(--SmartThemeBorderColor)';
        canvas.style.borderRadius = '5px';
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';

        const ctx = canvas.getContext('2d');

        // 白色背景
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        // 绘制二维码模块
        ctx.fillStyle = '#000000';
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(
                        (col + margin) * cellSize,
                        (row + margin) * cellSize,
                        cellSize,
                        cellSize
                    );
                }
            }
        }

        container.appendChild(canvas);

        console.log('[LAN Whitelist] 二维码生成成功！模块数:', moduleCount);

        // 显示状态
        const statusEl = document.getElementById('lan_whitelist_qr_status');
        if (statusEl) {
            statusEl.innerHTML = `
                <div style="margin-top: 10px;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: #4CAF50; font-size: 16px;">✅ 二维码已生成</div>
                    <div style="margin-bottom: 8px; font-size: 14px;">📱 使用手机相机或微信扫描</div>
                    <div style="background: var(--black50a); padding: 10px; border-radius: 5px; margin: 8px 0;">
                        <div style="font-size: 12px; color: var(--SmartThemeQuoteColor); margin-bottom: 4px;">配对地址：</div>
                        <div style="font-family: monospace; font-size: 11px; word-break: break-all;">${text}</div>
                    </div>
                    <div style="color: var(--SmartThemeQuoteColor); font-size: 13px;">
                        ⏱️ 此二维码 10 分钟内有效
                    </div>
                </div>
            `;
        }

    } catch (error) {
        console.error('[LAN Whitelist] 生成二维码失败:', error);
        container.innerHTML = `<div style="color: red; padding: 20px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 10px;">❌</div>
            <div>二维码生成失败</div>
            <div style="font-size: 12px; margin-top: 8px; color: #999;">${error.message}</div>
        </div>`;
    }
}

// 获取本机局域网 IP（过滤 Tailscale 等虚拟网卡）
function getAllLocalIPs() {
    return new Promise((resolve) => {
        const ips = [];
        const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

        if (!RTCPeerConnection) {
            console.log('[LAN Whitelist] WebRTC 不支持，使用降级方案');
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

                // 过滤 IP：
                // 1. 移除 127.0.0.1
                // 2. 移除 100.x.x.x (Tailscale)
                // 3. 只保留私有 IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
                const validIPs = [...new Set(ips)].filter(ip => {
                    if (ip === '127.0.0.1' || ip === 'localhost') return false;
                    if (!(/^\d+\.\d+\.\d+\.\d+$/.test(ip))) return false;

                    const parts = ip.split('.').map(Number);

                    // Tailscale (100.64.0.0/10)
                    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;

                    // 只保留私有 IP 段
                    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
                    if (parts[0] === 10) return true; // 10.0.0.0/8
                    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12

                    return false;
                });

                console.log('[LAN Whitelist] 所有检测到的 IP:', ips);
                console.log('[LAN Whitelist] 过滤后的局域网 IP:', validIPs);
                resolve(validIPs);
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

            const validIPs = [...new Set(ips)].filter(ip => {
                if (ip === '127.0.0.1' || ip === 'localhost') return false;
                if (!(/^\d+\.\d+\.\d+\.\d+$/.test(ip))) return false;

                const parts = ip.split('.').map(Number);

                if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;

                if (parts[0] === 192 && parts[1] === 168) return true;
                if (parts[0] === 10) return true;
                if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

                return false;
            });

            console.log('[LAN Whitelist] 超时，所有检测到的 IP:', ips);
            console.log('[LAN Whitelist] 过滤后的局域网 IP:', validIPs);
            resolve(validIPs);
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
        console.log('[LAN Whitelist] ===== 开始生成二维码 =====');
        toastr.info('正在检测局域网地址...', '局域网配对', { timeOut: 2000 });

        const localIPs = await getAllLocalIPs();

        if (localIPs.length === 0) {
            console.error('[LAN Whitelist] 未检测到有效的局域网 IP');
            toastr.error('未检测到局域网地址！\n请确保：\n1. 已连接 WiFi\n2. 不是通过 127.0.0.1 访问', '局域网配对', { timeOut: 5000 });

            const canvas = document.getElementById('lan_whitelist_qrcode');
            if (canvas) {
                canvas.innerHTML = `<div style="padding: 20px; text-align: center; color: #f44336;">
                    <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                    <div>未检测到局域网地址</div>
                    <div style="font-size: 12px; margin-top: 8px; color: #999;">请连接 WiFi 后刷新页面</div>
                </div>`;
            }
            return;
        }

        const serverIp = localIPs[0];
        const port = getCurrentPort();

        console.log('[LAN Whitelist] 使用 IP:', serverIp);
        console.log('[LAN Whitelist] 端口:', port);

        pairingUrl = generatePairingUrl(serverIp, port);
        console.log('[LAN Whitelist] 配对 URL:', pairingUrl);

        await drawQRCode(pairingUrl);

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
        toastr.success('配对链接已复制', '局域网配对', { timeOut: 2000 });
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
        console.log('[LAN Whitelist] 检测到配对请求');

        const clientIPs = await getAllLocalIPs();
        const clientIP = clientIPs[0] || 'unknown';
        const serverIP = window.location.hostname;

        console.log('[LAN Whitelist] 客户端 IP:', clientIP);
        console.log('[LAN Whitelist] 服务器 IP:', serverIP);

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
                    ✨ 您的设备已添加到白名单
                </div>

                <a href="/" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); margin-top: 10px;">
                    🚀 前往 SillyTavern
                </a>
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

    container.innerHTML = '<div class="notice">🔍 正在检测局域网地址...</div>';

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
                <p style="font-size: 12px; margin-top: 10px; color: var(--SmartThemeQuoteColor);">
                    💡 提示：会自动过滤 Tailscale 等虚拟网卡
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
        console.log('[LAN Whitelist] ===== 扩展初始化 =====');
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
