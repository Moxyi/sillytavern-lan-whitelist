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
let refreshTimer = null;
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
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// 获取服务器的所有局域网 IP
function getAllLocalIPs() {
    return new Promise((resolve) => {
        const ips = [];
        const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

        if (!RTCPeerConnection) {
            // 降级方案：从当前 URL 获取
            const hostname = window.location.hostname;
            if (hostname !== 'localhost' && hostname !== '127.0.0.1' && /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
                resolve([hostname]);
            } else {
                resolve([]);
            }
            return;
        }

        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');

        pc.onicecandidate = (ice) => {
            if (!ice || !ice.candidate || !ice.candidate.candidate) {
                pc.close();
                resolve([...new Set(ips)]);
                return;
            }

            const parts = ice.candidate.candidate.split(' ');
            const ip = parts[4];

            if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip !== '127.0.0.1' && !ip.startsWith('0.')) {
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
            resolve([...new Set(ips)]);
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

// 绘制二维码（使用 qrcode.js）
async function drawQRCode(text) {
    const container = document.getElementById('lan_whitelist_qrcode');
    if (!container) return;

    try {
        // 加载 qrcode.js 库
        await loadQRCodeLibrary();

        // 清空容器
        container.innerHTML = '';

        // 生成二维码
        qrcodeInstance = new QRCode(container, {
            text: text,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
        });

        // 显示提示
        const statusEl = document.getElementById('lan_whitelist_qr_status');
        if (statusEl) {
            statusEl.innerHTML = `
                <div style="margin-top: 10px;">
                    <div style="font-weight: bold; margin-bottom: 5px;">📱 配对地址：</div>
                    <div style="font-family: monospace; background: var(--black50a); padding: 8px; border-radius: 4px; word-break: break-all; font-size: 0.9em;">
                        ${text}
                    </div>
                    <div style="margin-top: 8px; color: var(--SmartThemeQuoteColor); font-size: 0.9em;">
                        ⏱️ 此二维码 10 分钟内有效
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('[LAN Whitelist] 生成二维码失败:', error);
        container.innerHTML = '<div style="color: red; text-align: center;">二维码库加载失败</div>';
    }
}

// 生成二维码
async function generateQRCode() {
    try {
        toastr.info('正在检测局域网地址...', '局域网配对', { timeOut: 2000 });

        const localIPs = await getAllLocalIPs();

        if (localIPs.length === 0) {
            toastr.error('未检测到局域网地址，请确保通过局域网 IP 访问', '局域网配对', { timeOut: 5000 });
            return;
        }

        // 使用第一个局域网 IP
        const serverIp = localIPs[0];
        const port = getCurrentPort();

        pairingUrl = generatePairingUrl(serverIp, port);

        await drawQRCode(pairingUrl);

        toastr.success('配对二维码已生成，10分钟内有效', '局域网配对', { timeOut: 3000 });

        // 开始轮询配对状态
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
        // 从 URL 推断客户端 IP（通过 referer 或其他方式）
        // 这里需要服务器端支持，暂时使用简化方案
        getAllLocalIPs().then(ips => {
            const clientIP = ips[0] || 'unknown';

            // 保存配对信息
            const pairingKey = `st-pairing-${token}`;
            const pairingData = JSON.parse(localStorage.getItem(pairingKey) || '{}');
            pairingData.pairedIP = clientIP;
            localStorage.setItem(pairingKey, JSON.stringify(pairingData));

            // 显示成功页面
            showPairingSuccessPage(clientIP);
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
        // 过滤掉 127.0.0.1
        if (ip === '127.0.0.1' || ip === 'localhost') {
            toastr.warning('不能添加本地回环地址到白名单');
            return;
        }

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

    container.innerHTML = '<div class="notice">正在检测局域网地址...</div>';

    try {
        const localIPs = await getAllLocalIPs();

        // 过滤掉 127.0.0.1
        const validIPs = localIPs.filter(ip => ip !== '127.0.0.1' && ip !== 'localhost');

        if (validIPs.length === 0) {
            container.innerHTML = `
                <div class="notice">
                    <p>⚠️ 未检测到局域网地址</p>
                    <p style="margin-top: 8px; font-size: 0.9em;">
                        请确保：<br>
                        1. 已连接到 WiFi 或局域网<br>
                        2. 通过局域网 IP 访问（例如：<code>http://192.168.1.x:8000</code>）
                    </p>
                    <p style="margin-top: 8px; font-size: 0.9em; color: var(--SmartThemeQuoteColor);">
                        当前访问：<code>${window.location.href}</code>
                    </p>
                </div>
            `;
            return;
        }

        const port = getCurrentPort();
        let html = '<div class="network-interfaces">';

        for (const ip of validIPs) {
            const portStr = (port && port !== '80' && port !== '443') ? `:${port}` : '';
            const fullUrl = `${window.location.protocol}//${ip}${portStr}`;

            html += `
                <div class="network-interface">
                    <div>
                        <div class="interface-name">🌐 局域网地址</div>
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
        container.innerHTML = '<div class="notice">网络检测失败</div>';
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
