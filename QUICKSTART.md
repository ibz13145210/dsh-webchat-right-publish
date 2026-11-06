# dsh-webchat-right — 快速入门

这是一个 **DeepSeek Harness** 插件，把 DeepSeek 网页版对接进桌面端右侧栏，
让登录状态跨重启保持。

## 一句话总结

- 左侧侧栏底部出现 **Chat DeepSeek** 按钮；
- 点击后在 **右侧栏标签页** 里打开 `chat.deepseek.com`（原生浏览器访客，不是 iframe）；
- 会话列被压缩，不是被页面遮住；
- 登录 **跨重启保持**（通过持久分区补丁）；
- 每次 DSH 升级后，点击一次盾牌图标即可自动重补（或手动跑脚本）。

## 快速上手

### 1. 安装插件

```bash
# 在 DeepSeek Harness 里安装（推荐）
dsh install-bundle /path/to/dsh-webchat-right

# 或者手动安装
cp -r dsh-webchat-right ~/.dsh/profiles/desktop/node_modules/@local/
```

### 2. 重启 DSH

### 3. 验证

左侧下方出现 **Chat DeepSeek**，点击后右侧栏打开 DeepSeek 标签页。

### 4. 确保登录持久化

- 首次操作：登录 DeepSeek；
- 点击左侧下方盾牌图标（状态应为 🟢 绿色）；
- 如是红色：确认后执行自动提权流程；如遇手动提权问题，以管理员身份运行：

```powershell
powershell -ExecutionPolicy Bypass -File "E:\DeepSeek_Web\dsh-webchat-right-publish\scripts\apply-persist.ps1"
```

### 6. 以后每次 DSH 升级后，重复第 4 步。

## 文件结构

```
dsh-webchat-right-publish/
├── package.json          # 插件包元信息
├── cordis.patch.yml      # Cordis 补丁：注册插件
├── lib/
│   ├── index.js          # 宿主半边：路由、登录快照、补丁执行
│   └── client.js         # 客户端半边：UI、右侧栏、访客生命周期
├── locale/
│   ├── zh.json           # 中文元信息
│   └── en.json           # 英文元信息
├── icon.svg              # 插件图标
├── NOTICE                # 许可声明
├── README.md             # 简介
├── USAGE.md              # 详细使用说明（中文）
├── USAGE-EN.md           # 详细使用说明（英文）
├── QUICKSTART.md         # 本文件
└── scripts/
    ├── apply-persist.ps1    # 一键应用持久分区补丁
    └── persist-partition.ps1 # 探测 / 补丁 / 还原工具
```

## 许可

Apache-2.0 · 基于 `@jaychang1989/dsh-webchat` 0.7.8（fork）

## 支持

- 原作者：`@jaychang1989`（[GitHub](https://github.com/jaychang1989/dsh-webchat)）
- DeepSeek Harness 桌面端：`0.2.1-rc.5`
- 适配：DSH web / desktop