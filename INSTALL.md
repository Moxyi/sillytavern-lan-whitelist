# 快速安装指南

## 一、安装前端扩展

### 选项 1: 扩展管理器

1. 打开 SillyTavern
2. 扩展管理 → 安装扩展
3. 输入：`https://github.com/Moxyi/sillytavern-lan-whitelist`

### 选项 2: 手动克隆

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/Moxyi/sillytavern-lan-whitelist.git
```

## 二、安装服务器插件

**重要：前端扩展和服务器插件都需要安装！**

```bash
cd SillyTavern/plugins
git clone https://github.com/Moxyi/sillytavern-lan-whitelist.git lan-whitelist-manager
cd lan-whitelist-manager
mv server-plugin.js index.js
```

或者手动：
1. 在 `SillyTavern/plugins/` 下创建 `lan-whitelist-manager` 文件夹
2. 将扩展目录中的 `server-plugin.js` 复制到该文件夹
3. 重命名为 `index.js`

## 三、配置 config.yaml

```yaml
enableServerPlugins: true
whitelistMode: true
whitelist:
  - 127.0.0.1
```

## 四、重启

```bash
npm start
```

## 验证安装

启动后查看日志，应该看到：
```
LAN Whitelist Manager API plugin loaded
```

打开扩展设置，应该能看到网络接口列表。

## 完成！

现在你可以动态管理白名单，无需重启服务器了！
