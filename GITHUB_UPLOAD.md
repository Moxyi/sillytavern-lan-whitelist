# 上传到 GitHub 的步骤

你的扩展已经完成！现在按照以下步骤上传到 GitHub：

## 文件清单

以下文件已创建在 `F:\AI\sillytavern-lan-whitelist\` 目录：

✅ **必需文件（扩展）**
- `manifest.json` - 扩展元数据
- `index.js` - 前端核心代码
- `settings.html` - 设置界面
- `style.css` - 样式表

✅ **服务器端支持**
- `server-routes.js` - API 路由代码

✅ **文档**
- `README.md` - 完整使用文档
- `QUICK_START.md` - 快速开始指南
- `SERVER_SETUP.md` - 服务器配置指南
- `LICENSE` - MIT 许可证
- `package.json` - NPM 元数据
- `.gitignore` - Git 忽略文件

## 上传步骤

### 1. 在 GitHub 上创建新仓库

1. 访问 https://github.com/new
2. 仓库名称：`sillytavern-lan-whitelist`
3. 描述：`Dynamic IP whitelist manager for SillyTavern - No restart required`
4. 设为 Public（公开）
5. 不要添加 README、.gitignore 或 license（我们已经创建了）
6. 点击 "Create repository"

### 2. 推送代码到 GitHub

在 PowerShell 中运行：

```powershell
cd F:\AI\sillytavern-lan-whitelist
git remote add origin https://github.com/Moxyi/sillytavern-lan-whitelist.git
git branch -M main
git push -u origin main
```

> 注意：将 `Moxyi` 替换为你的 GitHub 用户名

### 3. 验证上传

访问你的仓库页面，确认所有文件都已上传。

## 安装测试

### 在你自己的 SillyTavern 上测试

#### 方法 1: 通过扩展管理器

1. 打开 SillyTavern
2. 进入 `扩展管理` → `从 URL 安装`
3. 输入：`https://github.com/Moxyi/sillytavern-lan-whitelist`
4. 点击安装

#### 方法 2: 手动克隆

```bash
cd /path/to/SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/Moxyi/sillytavern-lan-whitelist.git
```

### 配置服务器端

参考 `SERVER_SETUP.md`，在 `server.js` 中添加 API 路由。

### 启用白名单模式

编辑 `config.yaml`：

```yaml
whitelistMode: true
whitelist:
  - 127.0.0.1
```

### 重启并测试

```bash
npm start
```

进入扩展设置，查看是否能正常显示网络接口信息。

## 分享给其他人

其他用户可以通过以下方式安装：

```
https://github.com/Moxyi/sillytavern-lan-whitelist
```

或者手动克隆到 `public/scripts/extensions/third-party/` 目录。

## 维护和更新

用户可以通过以下方式更新扩展：

```bash
cd /path/to/SillyTavern/public/scripts/extensions/third-party/sillytavern-lan-whitelist
git pull
```

或在扩展管理器中点击更新按钮。

## 已完成！

🎉 你的扩展已经准备好分享给全世界了！
