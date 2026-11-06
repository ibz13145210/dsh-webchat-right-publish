# dsh-webchat-right — 使用说明

本插件把 DeepSeek 网页版对接进 DeepSeek Harness 桌面端右侧栏，并提供登录跨重启保留的持久分区补丁。

## 一、插件安装

### 前提

- DeepSeek Harness 0.2.x 桌面端（Electron）
- 已安装 `@jaychang1989/dsh-webchat`（宿主半边依赖，用于登录快照与外链路由）

### 安装步骤

1. **复制插件目录**

   把本仓库 `dsh-webchat-right/` 整个目录复制到你的 DSH profile 的 `node_modules/` 下：

   ```powershell
   # 示例（Windows）：
   Copy-Item -Path ".\dsh-webchat-right" -Destination "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@local\" -Recurse -Force
   ```

   Linux/macOS 下：

   ```bash
   cp -r dsh-webchat-right ~/.dsh/profiles/desktop/node_modules/@local/
   ```

2. **添加 Cordis 补丁**

   在 profile 的 `cordis.patch.yml` 中追加：

   ```yaml
   - insert:
       - id: webchat-right
         name: '@local/dsh-webchat-right'
   ```

   示例路径：`$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml`

3. **重启 DSH**

   关闭 DeepSeek Harness，再重新打开。

4. **验证安装**

   打开 DSH 网页界面，左下角（侧栏底部，Settings 图标上方、账户头像上方）应出现 **Chat DeepSeek** 按钮。

   点击它，右侧栏应打开 `https://chat.deepseek.com/` 的标签页。

## 二、使用

### 打开 Chat DeepSeek

- 点击侧栏底部的 **Chat DeepSeek** 按钮。
- 右侧栏打开（或聚焦）DeepSeek 标签页。会话列被压缩，而不是被页面遮住。
- 再次点击：聚焦已有标签页，不会重复打开。
- 收起侧栏或切换到别的标签：页面只是隐藏，不重载，登录状态不丢。

### 刷新页面

在面板内按 **F5** 或 **Ctrl+R**（macOS 上为 **⌘+R**）可刷新官方 DeepSeek 页面。

### 退回主栏视图（兜底）

如果右侧栏服务不可用（例如没有会话、或全局面板模式），点击入口会退回主栏整页视图。

## 三、持久分区补丁（让登录跨重启）

### 为什么需要补丁

DSH 桌面端给每个浏览器访客的分区是进程级、随机命名的：

```
partition = `dsh-sidebar-browser-${randomUUID()}`
```

Cookie 与进程同生共灭，进程重启后登录状态就会丢失。

补丁把这条语句替换为等长的：

```
partition = "persist:"+workspace.replace(/:/g,"")
```

分区名固定为 `persist:dsh-webchat-right`，Cookie 与 localStorage 都会落盘，登录即可跨重启保留。

### 状态指示

侧栏底部右侧的盾牌图标显示补丁状态：

| 颜色 | 含义 | 操作 |
|------|------|------|
| 🟢 绿（带对勾） | 补丁在位 | 已禁用，无需重复执行 |
| 🔴 红色 | 未打补丁 | 点击执行补丁 |
| ⚪ 灰色 | 状态未知 | 接口异常，按钮仍可点击 |

### 执行补丁

1. 点击盾牌图标，弹出确认对话框；
2. 确认后，插件尝试自动提权；
   - **正常环境**：DSH 自动关闭、写入补丁、重新打开；
   - **受限环境**（宿主无法创建子进程）：提示把命令复制到剪贴板，你只需以 **管理员** 打开 PowerShell，粘贴执行即可；
3. 执行成功后，DSH 自动关闭并重新打开；
4. 重新登录一次 DeepSeek 网页版，之后重启 DSH 验证登录是否保留。

### 每次升级 DSH 后都需要再补一次

DSH 升级会替换 `app.asar`，补丁会被覆盖。升级完成后，再点击一次盾牌图标，或运行一次补丁脚本。

## 四、手动运行补丁脚本（备用）

如果自动提权不可用，或插件界面不方便操作，可以直接运行仓库中的 PowerShell 脚本。

### 脚本位置

- `scripts/apply-persist.ps1` —— 一键应用补丁（推荐）
- `scripts/persist-partition.ps1` —— 探测 / 打补丁 / 还原工具（细粒度控制）

### 运行方式

两个脚本都必须从 **管理员 PowerShell** 运行。

```powershell
# 1. 一键应用补丁（自动关闭 DSH、写入、重新打开）
powershell -ExecutionPolicy Bypass -File ".\scripts\apply-persist.ps1"

# 2. 仅探测当前状态（不修改）
powershell -ExecutionPolicy Bypass -File ".\scripts\persist-partition.ps1"

# 3. 打补丁（前提是 DSH 已关闭，且管理员权限）
powershell -ExecutionPolicy Bypass -File ".\scripts\persist-partition.ps1 -Patch"

# 4. 还原备份
powershell -ExecutionPolicy Bypass -File ".\scripts\persist-partition.ps1 -Restore
```

### 注意事项

- 补丁只做 **37 字节的等长替换**，写入前会备份 `app.asar.orig-bak`；
- 补丁前请先关闭 DSH（或让脚本自动关闭）；
- DSH 升级后会替换 `app.asar`，必须重新补一次，否则登录将不再跨重启保留；
- 还原后，如果你之前开启了持久分区，重启前请把插件里的 `PERSISTENT_PARTITION` 改回 `false`，否则页面会尝试在非持久分区上恢复旧快照，导致「闪一下已登录，随即掉线」。

## 五、已知边界

1. **右侧栏布局按会话保存**。换到从没开过这个标签页的会话时，第一次需要点一下入口。
2. **单例访客争用**。`keepMounted` 下同一 kind 在两个分栏同时可见时，单例访客可能抢位置（罕见，表现为页面在两边跳），暂未处理。
3. **不跟随上游更新**。fork 版本不会自动合并 `@jaychang1989/dsh-webchat` 的 npm 更新，DSH 升级后可能需要回归槽位契约。
4. **提权受限环境**。宿主若不能创建子进程（受限 Job / AppContainer），自动提权会静默失败，改为手动执行复制的命令。

## 六、许可

Apache-2.0，见 `NOTICE` 与上游仓库。

原作者：`@jaychang1989`，上游仓库：`https://github.com/jaychang1989/dsh-webchat`