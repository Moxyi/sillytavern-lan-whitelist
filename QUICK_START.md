# 快速开始指南

## 第一步：安装扩展

### 选项 A: 通过 GitHub（推荐）

1. 在 GitHub 上创建新仓库 `sillytavern-lan-whitelist`
2. 上传这个目录中的所有文件
3. 在 SillyTavern 中：
   - 打开 `扩展管理` → `安装扩展`
   - 输入：`https://github.com/你的用户名/sillytavern-lan-whitelist`
   - 点击安装

### 选项 B: 手动安装

```bash
cd /path/to/SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/Moxyi/sillytavern-lan-whitelist.git
```

## 第二步：配置服务器端

打开 `server.js`，找到类似这样的代码段（通常在文件中间部分）：

```javascript
// 在其他 API 路由附近添加以下代码
```

然后添加这些路由（完整代码见 `SERVER_SETUP.md`）：

```javascript
import os from 'os';
import { addWhitelistEntry, getWhitelistEntries, getBlockedAccessAttempts, clearBlockedAccessAttempts } from './src/middleware/whitelist.js';

app.get('/api/whitelist-manager/network', (req, res) => { /* ... */ });
app.get('/api/whitelist-manager/whitelist', (req, res) => { /* ... */ });
app.post('/api/whitelist-manager/whitelist/add', (req, res) => { /* ... */ });
app.get('/api/whitelist-manager/blocked', (req, res) => { /* ... */ });
app.post('/api/whitelist-manager/blocked/clear', (req, res) => { /* ... */ });
```

## 第三步：启用白名单模式

编辑 `config.yaml`：

```yaml
whitelistMode: true
whitelist:
  - 127.0.0.1
```

## 第四步：重启并使用

```bash
npm start
```

打开 SillyTavern，进入 `扩展设置`，找到 `LAN Whitelist Manager`。

## 使用方法

1. **查看网络接口** - 自动显示所有局域网 IP
2. **添加整个网段** - 点击 "Add subnet 192.168.1.0/24" 按钮
3. **批准被拦截的设备** - 在 "Blocked Devices" 区域点击 "Approve"
4. **手动添加 IP** - 在输入框中输入 IP 或 CIDR 格式（如 192.168.1.100 或 10.0.0.0/24）

## 完成！

现在你可以从局域网中的任何设备访问 SillyTavern，无需每次都重启服务器！
