# Authenticator - 2FA

浏览器扩展，使用 React 19、TypeScript、Vite、Tailwind CSS 与 daisyUI。界面与工作流以当前维护的 React 最新版设计为准：验证码、数据、设置三个主页面；认证、加密、存储与同步使用经过测试的 TypeScript 领域模块。生产环境不会预置示例账号。

## 本地开发与构建

需要 Node.js 24 或更新版本，以及 `package.json` 指定的 pnpm 12.11.2。

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run check
pnpm run test
pnpm run build
```

所有正式构建通过根目录 `build.sh` 执行。脚本会清理本机 Go 构建缓存（安装了 Go 时）、递增补丁版本、生成扩展、检查清单与资源，并在退出时清理本项目 `.artifacts`。`TAG_NAME=vX.Y.Z` 用于 CI 按发布标签写入精确版本。Web 开发服务器可预览真实本地账号工作流，网页填充、当前网站信息和浏览器同步需要安装扩展后使用。

```bash
bash build.sh                 # 与 pnpm run build 相同
pnpm run build:verify         # 校验已有构建，不递增版本
pnpm run package              # 构建并生成 artifacts/*.zip
pnpm run preview             # 预览已构建的 Web 入口
```

本项目是浏览器扩展，不包含需要替换的 macOS 原生应用，也没有 VPS 构建或部署步骤。构建不会自动修改用户浏览器中的已安装扩展。

## 安装

先完成本地构建，再加载对应目录。不要加载仓库根目录或 `legacy/prototype`。

| 浏览器 | 本地安装方式 |
| --- | --- |
| Chrome | 打开 `chrome://extensions`，开启开发者模式，加载已解压的 `dist/chrome` |
| Edge | 打开 `edge://extensions`，开启开发者模式，加载已解压的 `dist/edge` |
| Firefox | 打开 `about:debugging#/runtime/this-firefox`，选择“临时载入附加组件”，载入 `dist/firefox/manifest.json` |

Firefox 临时附加组件在退出浏览器后移除；长期安装需要按浏览器要求签名。当前没有 Safari 构建目标。Firefox 标识保持 `authenticator@example.local`，现有扩展身份、权限、侧边栏与快捷键配置均沿用原构建。重新加载同一已安装扩展可沿用其存储；换浏览器、配置文件或扩展 ID 前请先导出备份。

工具栏快捷键为 `Command/Ctrl + Shift + 2`，也可在浏览器扩展快捷键设置中修改。支持的文件选择场景会自动转到独立扩展窗口，避免弹窗关闭后丢失导入任务。

## 功能与数据

- TOTP、HOTP 与 Steam 验证码；SHA-1、SHA-256、SHA-512，验证码复制与网页安全填写。
- 搜索、当前网站匹配、收藏置顶、默认折叠；手动排序模式下拖动头像，或聚焦头像后使用上下方向键调整顺序。
- 手动添加、编辑、删除；上传二维码、拖入文件、摄像头扫码、屏幕共享识别，以及选择当前页面二维码。
- 导入 otpauth 文本、兼容的迁移二维码、JSON 与加密备份；混合文件和多份加密文件可逐份处理。
- 导出未加密 JSON、otpauth 列表或 AES-GCM 加密 `.2fa`，记录最后备份时间，逐个显示批量迁移二维码。
- 默认无需密码；可设置至少 8 位密码加密保险库，手动锁定、按空闲时间自动锁定，或关闭窗口时锁定。
- 可选浏览器同步：创建或加入已有组、保存与显示恢复密钥、立即同步、断开当前设备或删除同步副本。详见 [同步说明](docs/browser-sync.md)。
- 保留原 12 种界面语言，并加入新版原型的繁体中文和韩语；缺少的新词条使用已有词库或英文回退。支持系统、浅色、深色外观。

现有 v1 明文保险库、PBKDF2/AES-GCM 加密保险库、会话密钥和同步协议保持兼容；账号的收藏和指定域名作为可选字段保存。导入支持当前 React 导出的 `app: "2fa-authenticator"`、`version: 1` JSON 与加密 `.2fa`，以及使用当前账号结构的 JSON 账号列表；历史原型的 `2fa-backup` JSON 和加密 `.2fa` 不再支持，导入时会明确报错。备份不会包含同步恢复密钥或本机 Passkey 包装记录。

## Passkey 与能力边界

Passkey 注册先要求本机保险库启用密码。只有当前来源与验证器支持 WebAuthn PRF 时，才会用验证器产生的密钥包装真实保险库密钥；解锁必须成功解密保险库，不会只隐藏锁屏。扩展来源、浏览器或验证器不支持时会显示真实错误，并保留密码解锁。改变或移除保险库密码后需要重新注册。注册不会添加远端登录服务或本机 companion。

原视觉原型中的“网页输入框增强菜单”没有实际实现，当前保留明确禁用的入口；可使用卡片的填写按钮。原型里的示例设备、已连接状态和单设备撤销没有真实同步协议支持，因此正式界面只显示真实同步状态与现有协议支持的操作。摄像头、屏幕共享和真实平台 Passkey 的可用性取决于本机权限与验证器，不能通过构建或模拟测试证明。

## 代码与验证

[架构与目录说明](docs/architecture.md) · [验证指南](docs/testing.md) · [浏览器同步](docs/browser-sync.md)

原根目录界面和依赖按原样保存在 [历史视觉原型](legacy/prototype/README.md)，仅供历史设计追溯，不参与编译，也不承诺历史备份兼容。当前源码、依赖和构建链已不再使用 Svelte。
