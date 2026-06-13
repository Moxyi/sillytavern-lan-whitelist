// SillyTavern LAN Whitelist Manager - Server Routes
// 将此代码添加到 server.js 中，或创建为单独的路由文件

import os from 'os';
import {
    addWhitelistEntry,
    getWhitelistEntries,
    getBlockedAccessAttempts,
    clearBlockedAccessAttempts
} from './src/middleware/whitelist.js';

/**
 * 设置白名单管理 API 路由
 * @param {Express} app - Express 应用实例
 */
export function setupWhitelistManagerRoutes(app) {
    // 获取网络接口信息
    app.get('/api/whitelist-manager/network', (req, res) => {
        try {
            const interfaces = os.networkInterfaces();
            const result = [];

            for (const [name, addrs] of Object.entries(interfaces)) {
                if (!addrs) continue;

                for (const addr of addrs) {
                    if (addr.family === 'IPv4' && !addr.internal) {
                        const parts = addr.address.split('.');
                        const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
                        result.push({
                            name,
                            address: addr.address,
                            subnet,
                        });
                    }
                }
            }

            res.json({ interfaces: result });
        } catch (error) {
            console.error('Failed to get network interfaces:', error);
            res.status(500).json({ error: 'Failed to get network interfaces' });
        }
    });

    // 获取当前白名单
    app.get('/api/whitelist-manager/whitelist', (req, res) => {
        try {
            const entries = getWhitelistEntries();
            res.json({ entries });
        } catch (error) {
            console.error('Failed to get whitelist:', error);
            res.status(500).json({ error: 'Failed to get whitelist' });
        }
    });

    // 添加到白名单
    app.post('/api/whitelist-manager/whitelist/add', (req, res) => {
        try {
            const { ip } = req.body;

            if (!ip) {
                return res.status(400).json({ error: 'IP address is required' });
            }

            const result = addWhitelistEntry(ip, true);
            res.json({ success: true, added: result.added, entry: result.entry });
        } catch (error) {
            console.error('Failed to add to whitelist:', error);
            res.status(400).json({ error: error.message || 'Failed to add to whitelist' });
        }
    });

    // 获取被拦截的访问记录
    app.get('/api/whitelist-manager/blocked', (req, res) => {
        try {
            const attempts = getBlockedAccessAttempts();
            res.json({ attempts });
        } catch (error) {
            console.error('Failed to get blocked attempts:', error);
            res.status(500).json({ error: 'Failed to get blocked attempts' });
        }
    });

    // 清空被拦截的记录
    app.post('/api/whitelist-manager/blocked/clear', (req, res) => {
        try {
            clearBlockedAccessAttempts();
            res.json({ success: true });
        } catch (error) {
            console.error('Failed to clear blocked attempts:', error);
            res.status(500).json({ error: 'Failed to clear blocked attempts' });
        }
    });
}
