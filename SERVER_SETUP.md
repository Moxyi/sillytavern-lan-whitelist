# 服务器端安装指南

本扩展需要在 SillyTavern 服务器端添加一些 API 路由。有两种方法：

## 方法 1: 直接在 server.js 中添加（推荐）

打开 `server.js`，在合适的位置（建议在其他 API 路由附近）添加以下代码：

```javascript
import os from 'os';
import { 
    addWhitelistEntry, 
    getWhitelistEntries, 
    getBlockedAccessAttempts, 
    clearBlockedAccessAttempts 
} from './src/middleware/whitelist.js';

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
```

## 方法 2: 使用单独的路由文件

1. 将 `server-routes.js` 复制到 SillyTavern 根目录
2. 在 `server.js` 中导入并使用：

```javascript
import { setupWhitelistManagerRoutes } from './server-routes.js';

// 在 app 初始化后添加
setupWhitelistManagerRoutes(app);
```

## 重启服务器

修改后重启 SillyTavern：

```bash
npm start
```

## 验证安装

打开浏览器控制台，访问：

```
http://localhost:8000/api/whitelist-manager/network
```

如果返回 JSON 数据，说明安装成功！
