// LAN Whitelist Manager Extension - 局域网白名单管理器
const extensionName = 'sillytavern-lan-whitelist';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const MODULE_NAME = 'lan-whitelist';

const defaultSettings = {
    whitelistedIPs: [],
    serverIPs: [], // 记录服务器的局域网 IP
};

let currentSettings = defaultSettings;
let pairingUrl = '';
let qrcodeInstance = null;

function loadSettings() {
    const stored = localStorage.getItem(`st-ext-${MODULE_NAME}-settings`);
    if (stored) {
        currentSettings = { ...defaultSettings, ...JSON.parse(stored) };
    }
}

function saveSettings() {
    localStorage.setItem(`st-ext-${MODULE_NAME}-settings`, JSON.stringify(currentSettings));
}

// 动态加载 qrcode.js 库
async function loadQRCodeLibrary() {
    if (window.QRCode) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
        script.onload = resolve;
        script.onerror = () => {
            // 降级：使用 unpkg CDN
            const script2 = document.createElement('script');
            script2.src = 'https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js';
            script2.onload = resolve;
            script2.onerror = reject;
            document.head.appendChild(script2);
        };
        document.head.appendChild(script);
    });
}

// 获取本机的所有局域网 IP（过滤 127.0.0.1）
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
                const uniqueIPs = [...new Set(ips)].filter(ip =>
                    ip !== '127.0.0.1' &&
                    ip !== 'localhost' &&
                    !ip.startsWith('0.') &&
                    /^\d+\.\d+\.\d+\.\d+$/.test(ip)
                );
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

        // 5秒超时
        setTimeout(() => {
            pc.close();
            const uniqueIPs = [...new Set(ips)].filter(ip =>
                ip !== '127.0.0.1' &&
                ip !== 'localhost' &&
                !ip.startsWith('0.') &&
                /^\d+\.\d+\.\d+\.\d+$/.test(ip)
            );
            resolve(uniqueIPs);
        }, 5000);
    });
}

// 获取当前端口
function getCurrentPort() {
    const port = window.location.port;
    if (port) return port;
    return window.location.protocol === 'https:' ? '443' : '8000';
}

// 生成配对 URL
function generatePairingUrl(serverIp, port) {
    const protocol = window.location.protocol;
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now();

    // 存储配对令牌和服务器 IP
    const pairingData = {
        token: token,
        serverIP: serverIp,
        timestamp: timestamp,
        expiresAt: timestamp + 10 * 60 * 1000,
    };
    localStorage.setItem(`st-pairing-${token}`, JSON.stringify(pairingData));

    // 记录服务器 IP
    if (!currentSettings.serverIPs.includes(serverIp)) {
        currentSettings.serverIPs.push(serverIp);
        saveSettings();
    }

    const portStr = (port && port !== '80' && port !== '443') ? `:${port}` : '';
    pairingUrl = `${protocol}//${serverIp}${portStr}/?pair=${token}`;
    return pairingUrl;
}

// 绘制二维码
async function drawQRCode(text) {
    const container = document.getElementById('lan_whitelist_qrcode');
    if (!container) return;

    try {
        await loadQRCodeLibrary();
        container.innerHTML = '';

        qrcodeInstance = new QRCode(container, {
            text: text,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
        });

        const statusEl = document.getElementById('lan_whitelist_qr_status');
        if (statusEl) {
            statusEl.innerHTML = `
                <div style="margin-top: 10px;">
                    <div style="font-weight: bold; margin-bottom: 5px;">📱 用手机扫描此二维码</div>
                    <div style="font-family: monospace; background: var(--black50a); padding: 8px; border-radius: 4px; word-break: break-all; font-size: 0.85em;">
                        ${text}
                    </div>
                    <div style="margin-top: 8px; color: #4CAF50; font-size: 0.9em;">
                        ✅ 扫码后会自动添加手机 IP 到白名单
                    </div>
                    <div style="margin-top: 4px; color: var(--SmartThemeQuoteColor); font-size: 0.85em;">
                        ⏱️ 此二维码 10 分钟内有效
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('[LAN Whitelist] 生成二维码失败:', error);
        container.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">二维码库加载失败，请检查网络连接</div>';
    }
}

// 生成二维码
async function generateQRCode() {
    try {
        toastr.info('正在检测局域网地址...', '局域网配对', { timeOut: 2000 });

        const localIPs = await getAllLocalIPs();

        if (localIPs.length === 0) {
            toastr.error('未检测到局域网地址！请确保：\n1. 已连接 WiFi\n2. 不是通过 127.0.0.1 访问', '局域网配对', { timeOut: 5000 });
            return;
        }

        const serverIp = localIPs[0];
        const port = getCurrentPort();

        pairingUrl = generatePairingUrl(serverIp, port);

        await drawQRCode(pairingUrl);

        toastr.success(`服务器 IP: ${serverIp}，二维码已生成`, '局域网配对', { timeOut: 3000 });

        checkPairingStatus();
    } catch (error) {
        console.error('[LAN Whitelist] 生成二维码失败:', error);
        toastr.error('生成二维码失败：' + error.message);
    }
}

// 检查配对状态
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

// 复制配对链接
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

// 处理配对请求（手机端）
async function handlePairingRequest() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('pair');

    if (token) {
        console.log('[LAN Whitelist] 检测到配对请求，token:', token);

        // 获取手机的局域网 IP
        const clientIPs = await getAllLocalIPs();
        const clientIP = clientIPs[0] || 'unknown';

        // 获取服务器 IP（从 URL 中）
        const serverIP = window.location.hostname;

        // 保存配对信息
        const pairingKey = `st-pairing-${token}`;
        const pairingData = JSON.parse(localStorage.getItem(pairingKey) || '{}');
        pairingData.pairedIP = clientIP;
        localStorage.setItem(pairingKey, JSON.stringify(pairingData));

        // 显示配对成功页面
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

                <div style="margin-top: 20px; font-size: 13px; color: #999;">
                    您可以关闭此页面或点击上方按钮访问
                </div>
            </div>
        </div>
    `;
}

async function addToWhitelist(ip) {
    try {
        if (ip === '127.0.0.1' || ip === 'localhost' || ip === 'unknown') {
            return;
        }

        if (!currentSettings.whitelistedIPs.includes(ip)) {
            currentSettings.whitelistedIPs.push(ip);
            saveSettings();
            toastr.success(`IP ${ip} 已添加到白名单`, '局域网白名单');
            await refreshData();
        }
    } catch (error) {
        console.error('[LAN Whitelist] 添加白名单失败:', error);
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

    try {
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
                    <p style="margin-top: 12px; font-size: 13px; color: var(--SmartThemeQuoteColor);">
                        💡 <strong>提示：</strong>在电脑上运行 <code>ipconfig</code> (Windows) 或 <code>ifconfig</code> (Mac/Linux) 查看本机 IP
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
    } catch (error) {
        console.error('[LAN Whitelist] 渲染网络信息失败:', error);
        container.innerHTML = '<div class="notice">❌ 网络检测失败</div>';
    }
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
                <button class="menu_button compact remove-btn" data-ip="${entry}" title="移除此 IP">
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

// Initialize
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
