# Authenticator - 2FA

新标志：深蓝圆盘 + 白色盾牌钥匙孔 + 30 秒倒计时圆环（钴蓝弧，最后 5 秒转红）。

## 安装（Chrome / Edge 开发者模式）

1. 解压本 zip 到一个固定文件夹。
2. 打开 chrome://extensions（Edge：edge://extensions），开启右上角「开发者模式」。
3. 点「加载已解压的扩展程序」，选择解压出的文件夹。
4. 工具栏会出现盾牌钥匙孔图标，点开即用。

## 包含文件

- manifest.json — MV3 扩展清单
- popup.html / popup.css / popup.js — 弹窗（380×620）全部界面与逻辑
- content.js — 接收弹窗 Fill 指令，把验证码填入网页输入框
- qrcode.min.js — 二维码生成（qrcode-generator 1.4.4）
- jsQR.js — 二维码识别（摄像头 / 截图 / 上传图片真实解码）
- icons/ — 新标志图标 16 / 32 / 48 / 128（倒计时环为谷歌四色分段）
- _locales/ — 扩展多语言文案（zh_CN / zh_TW / en / ja / ko / de / es）（倒计时环为谷歌四色分段）
- _locales/ — 扩展多语言文案（zh_CN / zh_TW / en / ja / ko / de / es）（倒计时环为谷歌四色分段）
- _locales/ — 扩展多语言文案（zh_CN / zh_TW / en / ja / ko / de / es）（倒计时环为谷歌四色分段）
- _locales/ — 扩展多语言文案（zh_CN / zh_TW / en / ja / ko / de / es）（倒计时环为谷歌四色分段）
- _locales/ — 扩展多语言文案（zh_CN / zh_TW / en / ja / ko / de / es）（倒计时环为谷歌四色分段）
- _locales/ — 扩展多语言文案（zh_CN / zh_TW / en / ja / ko / de / es）（倒计时环为谷歌四色分段）
- _locales/ — 扩展多语言文案（zh_CN / zh_TW / en / ja / ko / de / es）

## 界面语言

界面自动跟随系统 / 浏览器语言，支持简体中文、繁體中文、English、日本語、한국어、Deutsch、Español 共 7 种语言；也可在「设置 → 语言」里手动指定或切回自动。Fill 按钮与全部文案随语言切换。所有自定义下拉都在顶层浮层展开，不会被卡片或导航遮挡。

## 功能

- TOTP 验证码实时生成（HMAC-SHA1/256/512，6/7/8 位，30/60 秒步长），WebCrypto 实现
- 「全部」默认折叠当前网站；收藏置顶；拖拽卡片左侧图标排序；点卡片复制；···菜单收藏 / 编辑 / 二维码 / 删除
- 扫码添加三入口：屏幕截图（getDisplayMedia）/ 上传文件 / 摄像头（最右），均真实解码 otpauth
- 数据：otpauth / JSON 导入，AES-GCM 加密备份（.2fa）/ JSON / otpauth 导出，最后备份时间精确到分钟
- 浏览器同步：恢复密钥本机加密 → chrome.storage.sync 浏览器账号通道，含已同步设备列表与立即失效
- 界面密码 + Passkey（WebAuthn 通行密钥）解锁，自动锁定；设置里可注册 Passkey（可发现凭据），锁定时用它验证
