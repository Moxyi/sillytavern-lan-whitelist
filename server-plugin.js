import os from 'node:os';
import {
    addWhitelistEntry,
    getWhitelistEntries,
    getBlockedAccessAttempts,
    clearBlockedAccessAttempts
} from '../../src/middleware/whitelist.js';

export const info = {
    id: 'lan-whitelist-manager',
    name: 'LAN Whitelist Manager API',
    description: 'Provides API endpoints for the LAN Whitelist Manager extension',
};

export async function init(router) {
    console.log('LAN Whitelist Manager API plugin loaded');

    // Get network interfaces
    router.get('/network', (req, res) => {
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

    // Get whitelist entries
    router.get('/whitelist', (req, res) => {
        try {
            const entries = getWhitelistEntries();
            res.json({ entries });
        } catch (error) {
            console.error('Failed to get whitelist:', error);
            res.status(500).json({ error: 'Failed to get whitelist' });
        }
    });

    // Add to whitelist
    router.post('/whitelist/add', (req, res) => {
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

    // Get blocked attempts
    router.get('/blocked', (req, res) => {
        try {
            const attempts = getBlockedAccessAttempts();
            res.json({ attempts });
        } catch (error) {
            console.error('Failed to get blocked attempts:', error);
            res.status(500).json({ error: 'Failed to get blocked attempts' });
        }
    });

    // Clear blocked attempts
    router.post('/blocked/clear', (req, res) => {
        try {
            clearBlockedAccessAttempts();
            res.json({ success: true });
        } catch (error) {
            console.error('Failed to clear blocked attempts:', error);
            res.status(500).json({ error: 'Failed to clear blocked attempts' });
        }
    });
}

export async function exit() {
    console.log('LAN Whitelist Manager API plugin unloaded');
}
