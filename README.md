# dsh-webchat-right

`@jaychang1989/dsh-webchat` 0.7.8 的本地改造分支：把「Chat DeepSeek」从左侧图标栏
搬到**侧栏底部**（Settings 旁、账户头像上方），页面渲染改到**右侧栏标签页**，
不再占用主栏会话视图。

## 与上游的差异

| | 上游 0.7.8 | 本分支 |
|---|---|---|
| 入口 | `sidebar.panellist` 图标 | `sidebar.footer.action` 底部行 |
| 页面 | `main` 整页视图 | `sidebarRightTabs` 类型 + `sidebar.right.pane.tab` body |
| 兜底 | 无 | 无右侧栏时退回 `main` 整页 |
| 宿主半边 | 自带 | 原样复用（依赖 `@jaychang1989/dsh-webchat`） |

`keepMounted: true` 让标签页 body 在切标签、切会话、收起侧栏时都不销毁；
访客是单例，每个 body 只在真正可见时把访客定位到自己身上，因此多个会话的
keepMounted body 不会互相抢位置。

## 行为

- 点侧栏底部的 **Chat DeepSeek**：右侧栏打开（或聚焦）DeepSeek 标签页，
  会话列被压缩而不是被遮住；
- 再点一次：聚焦已有标签页（不会重复打开）；
- 侧栏收起 / 切到别的标签：页面只是隐藏，不重载；
- 登录沿用上游快照：`~/.dsh/dsh-webchat/session.json`，跨重启恢复；
- 面板内 **F5 / Ctrl+R** 刷新官方页面。

## 持久分区补丁（让登录跨重启）

DSH 桌面端给每个浏览器访客的分区是进程级、随机命名的，cookie 随进程消失。
只有 Electron 主进程能读一个分区的 cookie（含 HttpOnly），所以这一半把 cookie
写盘、下次启动前写回；页面自己的 localStorage 与 document.cookie 由浏览器半边搬运。

但上面这套快照机制有一个前提：分区名必须是固定的。原生分区名是
`dsh-sidebar-browser-${randomUUID()}`，每次进程重启都不同，cookie 也就跟着丢了。
补丁把它替换成 `"persist:"+workspace.replace(/:/g,"")`，分区名固定为
`persist:dsh-webchat-right`，cookie 与 localStorage 都会落盘，登录跨重启自然保留。

补丁只做 **37 字节的等长替换**，写入前会备份 `app.asar.orig-bak`。
每次 DSH 升级后需要再点一次。

### 状态指示

侧栏底部右侧的盾牌图标就是补丁状态：

- 🟢 绿色（带对勾）= 补丁在位，已禁用，无需重复执行；
- 🔴 红色 = 未打补丁，重启后会丢登录，可点击；
- ⚪ 灰色 = 状态未知（接口异常时），按钮仍可点击。

### 执行方式

1. 点击盾牌图标，会弹出确认对话框；
2. 确认后，插件会尝试自动提权。在受限环境（如 AppContainer）里，
   提权可能静默失败，此时会提示「这个环境里宿主无法自动提权」，
   并把命令复制到剪贴板，你只需以管理员打开 PowerShell，粘贴执行即可；
3. 执行成功后 DSH 会自动关闭并重新打开，重新登录一次 DeepSeek，
   之后重启即可验证登录是否保留。

如果自动提权不可用，也可以直接运行仓库里的
`scripts/apply-persist.ps1`（需要管理员 PowerShell）。

## 已知边界

- 右侧栏布局按 Session 保存（`dsh.sidebar-right.v1.<sessionId>`）：换到没开过
  这个标签页的会话时，第一次需要点一下入口；
- `keepMounted` 下同一 kind 在两个分栏里同时可见时会争用单例访客（罕见，
  表现为页面在两边跳）；Level 1 未处理；
- fork 不跟随上游 npm 更新，DSH 升级后需要回归槽位契约。

## 许可

Apache-2.0，见 `NOTICE` 与上游仓库。

## 安装

### 通过 DSH profile 安装

```bash
# 在 DeepSeek Harness 的 profile 目录下
dsh install-bundle /path/to/dsh-webchat-right
```

或直接在 `package.json` 中添加依赖后重启 DSH。

### 手动安装

1. 确保 `@jaychang1989/dsh-webchat` 已安装（宿主半边依赖它）；
2. 复制本目录到 profile 的 `node_modules/@local/dsh-webchat-right`；
3. 在 profile 的 `cordis.patch.yml` 中添加：
   ```yaml
   - insert:
       - id: webchat-right
         name: '@local/dsh-webchat-right'
   ```
4. 重启 DSH。

## 文件结构

```
dsh-webchat-right/
├── package.json          # 包元信息
├── cordis.patch.yml      # Cordis 补丁：注册插件
├── lib/
│   ├── index.js          # 宿主半边：路由、登录快照、补丁执行
│   └── client.js         # 客户端半边：UI、右侧栏、访客生命周期
├── locale/
│   ├── zh.json           # 中文元信息
│   └── en.json           # 英文元信息
├── icon.svg              # 图标
├── NOTICE                # 许可声明
├── README.md             # 本文件
└── USAGE.md              # 使用说明
```