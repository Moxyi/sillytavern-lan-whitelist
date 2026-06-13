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

### 第一步：安装前端扩展

**方法 A: 通过扩展管理器（推荐）**

1. 打开 SillyTavern
2. 进入 `扩展管理` → `安装扩展`
3. 输入：`https://github.com/Moxyi/sillytavern-lan-whitelist`
4. 点击安装

**方法 B: 手动安装**

```bash
cd /path/to/SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/Moxyi/sillytavern-lan-whitelist.git
```

### 第二步：安装服务器插件

```bash
cd /path/to/SillyTavern/plugins
git clone https://github.com/Moxyi/sillytavern-lan-whitelist.git lan-whitelist-manager
```

### 第三步：配置

**1. 启用服务器插件**

编辑 `config.yaml`：

```yaml
# 启用服务器插件
enableServerPlugins: true

# 启用白名单模式
whitelistMode: true

# 初始白名单
whitelist:
  - 127.0.0.1
```

**2. 重启 SillyTavern**

```bash
npm start
```

## 使用方法

1. 打开 SillyTavern
2. 进入 `扩展设置`
3. 找到 `LAN Whitelist Manager` 部分
4. 查看网络接口并点击按钮添加局域网段
5. 或者在被拦截设备列表中批准新设备

## 文件说明

- `index.js` - 前端扩展代码
- `server-plugin.js` - 服务器插件（需复制到 `plugins/` 目录）
- `settings.html` - 设置界面
- `style.css` - 样式

## 安装位置

- **前端扩展**: `SillyTavern/public/scripts/extensions/third-party/sillytavern-lan-whitelist/`
- **服务器插件**: `SillyTavern/plugins/lan-whitelist-manager/`（将 `server-plugin.js` 重命名为 `index.js`）

## 故障排除

### 扩展显示 "No network interfaces found"

- 确认服务器插件已正确安装到 `plugins/lan-whitelist-manager/` 目录
- 确认 `config.yaml` 中 `enableServerPlugins: true`
- 重启 SillyTavern
- 检查服务器日志是否显示 "LAN Whitelist Manager API plugin loaded"

### API 请求失败

- 确保服务器插件的 `server-plugin.js` 重命名为 `index.js`
- 检查浏览器控制台错误信息
- 确认白名单模式已启用

## 许可证

MIT License

## 版本历史

**v1.0.3** (最新)
- ✅ 使用服务器插件系统，不修改 SillyTavern 核心代码
- ✅ 改进安装流程

**v1.0.2**
- ✅ 修复扩展加载错误

**v1.0.0**
- 初始版本
