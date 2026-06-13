# SillyTavern LAN Whitelist Manager

动态管理 SillyTavern 的 IP 白名单，无需重启服务器即可添加新设备。

## 功能特性

- 🔍 查看服务器所有网络接口和 IP 地址
- ✅ 一键添加整个局域网段到白名单
- 📋 查看当前白名单条目
- 🚫 查看被拦截的设备并快速批准
- 🔄 自动刷新状态
- ⚡ 无需重启服务器

## 安装方法

### 方法 1: 通过扩展安装器（推荐）

1. 打开 SillyTavern
2. 进入 `扩展管理` → `安装扩展`
3. 输入仓库地址：`https://github.com/Moxyi/sillytavern-lan-whitelist`
4. 点击安装

### 方法 2: 手动安装

```bash
cd /path/to/SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/Moxyi/sillytavern-lan-whitelist.git
```

## 配置

### 1. 启用白名单模式

在 `config.yaml` 中：

```yaml
# 启用白名单模式
whitelistMode: true

# 初始白名单（至少包含本机）
whitelist:
  - 127.0.0.1
```

### 2. 配置 API 端点

本扩展需要服务器端支持。将以下代码添加到 `server.js` 中（或创建一个 Express 中间件）：

```javascript
// 在 server.js 中添加这些路由
import os from 'os';
import { 
    addWhitelistEntry, 
    getWhitelistEntries, 
    getBlockedAccessAttempts, 
    clearBlockedAccessAttempts 
} from './src/middleware/whitelist.js';

// 获取网络接口信息
app.get('/api/whitelist-manager/network', (req, res) => {
    const interfaces = os.networkInterfaces();
    const result = [];
    
    for (const [name, addrs] of Object.entries(interfaces)) {
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
});

// 获取白名单
app.get('/api/whitelist-manager/whitelist', (req, res) => {
    res.json({ entries: getWhitelistEntries() });
});

// 添加到白名单
app.post('/api/whitelist-manager/whitelist/add', (req, res) => {
    try {
        const { ip } = req.body;
        addWhitelistEntry(ip, true);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// 获取被拦截的设备
app.get('/api/whitelist-manager/blocked', (req, res) => {
    res.json({ attempts: getBlockedAccessAttempts() });
});

// 清空拦截记录
app.post('/api/whitelist-manager/blocked/clear', (req, res) => {
    clearBlockedAccessAttempts();
    res.json({ success: true });
});
```

### 3. 重启 SillyTavern

```bash
npm start
```

## 使用方法

1. 打开 SillyTavern
2. 进入 `扩展设置`
3. 找到 `LAN Whitelist Manager` 部分
4. 查看网络接口并点击按钮添加局域网段
5. 或者在被拦截设备列表中批准新设备

## 工作原理

1. **前端扩展** 提供用户界面
2. **API 端点** 与服务器通信
3. **白名单中间件** 动态更新 `whitelist.txt`
4. **无需重启** - 白名单立即生效

## 注意事项

- 确保在 `config.yaml` 中启用了 `whitelistMode: true`
- 首次使用时至少要在白名单中添加 `127.0.0.1`
- 添加整个网段 (如 `192.168.1.0/24`) 会允许该网段内的所有设备

## 故障排除

### 扩展无法加载

- 检查文件是否在正确的目录：`public/scripts/extensions/third-party/sillytavern-lan-whitelist/`
- 刷新页面并检查浏览器控制台是否有错误

### API 请求失败

- 确保已在 `server.js` 中添加了 API 路由
- 重启 SillyTavern
- 检查浏览器控制台和服务器日志

### 添加白名单后仍无法访问

- 确认 `whitelistMode: true` 已启用
- 检查添加的 IP 是否正确
- 检查防火墙设置

## 许可证

MIT License

## 作者

Moxyi

## 贡献

欢迎提交 Issue 和 Pull Request！
