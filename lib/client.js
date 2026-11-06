/**
 * dsh-webchat-right — browser half.
 *
 * 上游 @jaychang1989/dsh-webchat 0.7.8 的浏览器半边改造版。保持它最有价值的两件事：
 *
 *   1. 页面是宿主自带的原生浏览器访客（`<webview>`），不是 iframe ——
 *      `frame-ancestors 'none'` 对访客不生效；
 *   2. 访客元素挂在 document 根上、按面板矩形定位、切走只隐藏不销毁 ——
 *      页面不重载，登录不丢，登录快照由宿主半边落盘。
 *
 * 改动只有入口与容器：
 *
 *   - 入口从 `sidebar.panellist`（左侧图标栏）搬到 `sidebar.footer.action`
 *     （侧栏底部、Settings 旁、账户头像上方那一行）；
 *   - 页面从 `main`（主栏整页）搬到右侧栏标签页：
 *     `ctx.sidebarRightTabs.register` 声明 tab 类型，`sidebar.right.pane.tab`
 *     提供 body，`ctx.sidebarRight.openTab` 打开。右侧栏默认 push 模式，
 *     会话让出宽度而不是被遮住；
 *   - `main` 仍注册为兜底页：没有会话、或右侧栏服务不可用时退回整页视图。
 *
 * 访客仍是单例。多个会话的 body 会因 `keepMounted` 同时存在，所以每个 body
 * 只在自身「真正可见」时才把访客定位到自己身上；不可见时让出并隐藏。
 */
window.__ModuleLoader__.load({
  id: "@local/dsh-webchat-right",
  factory: (require) => {
    const React = require("react")
    const h = React.createElement

    /** 右侧栏 tab 的 kind（打开时按它找类型）。 */
    const KIND = "webchat-chat"
    /** tab 类型 id：`sidebarRightTabs` 注册与 body 槽位的 key 用同一个值。 */
    const TAB_TYPE_ID = "@local/dsh-webchat-right/chat"
    /** 兜底主栏面板的 id（仅在没有右侧栏可用时出现）。 */
    const PANEL_ID = "webchat"
    /** 侧栏底部入口的槽位 id。 */
    const FOOTER_ID = "webchat-right"
    /** 官方页面。 */
    const PAGE_URL = "https://chat.deepseek.com/"
    /** 存储身份：固定身份 = 固定持久分区名（persist:dsh-webchat-right）。 */
    const STORAGE_IDENTITY = "dsh-webchat-right"
    /**
     * 分区是否已经是持久的（宿主打过 persist 补丁）。
     *
     * 持久分区自己就会把 cookie 与 localStorage 落盘，所以那条"把旧快照写回
     * 再 reload"的补救流程必须关掉：它会用登录前的旧快照覆盖新分区，然后
     * 强制刷新，表现就是"闪一下已登录，随即掉线"。
     */
    const PERSISTENT_PARTITION = true
    /** 宿主路由：窗口降级 / 登录快照 / 外链。 */
    const OPEN_ROUTE = "/api/dsh-webchat/open"
    const RESTORE_ROUTE = "/api/dsh-webchat/session/restore"
    const SAVE_ROUTE = "/api/dsh-webchat/session/save"
    const EXTERNAL_ROUTE = "/api/dsh-webchat/external"
    const PATCH_STATUS_ROUTE = "/api/dsh-webchat/persist-patch/status"
    const PATCH_APPLY_ROUTE = "/api/dsh-webchat/persist-patch/apply"
    /** 快照节奏。 */
    const SAVE_INTERVAL_MS = 30000

    const STYLE_ID = "dsh-webchat-right-style"
    const OVERLAY_ATTR = "data-dsh-webchat-right-overlay"

    /** 读时取语言，label 的 thunk 才能跟随界面语言。 */
    function localeTag() {
      return String(document.documentElement.getAttribute("lang")
        || (typeof navigator === "object" ? navigator.language : "")
        || "").toLowerCase()
    }

    function isChinese() {
      return localeTag().indexOf("zh") === 0
    }

    function isRussian() {
      return localeTag().indexOf("ru") === 0
    }

    /** 本插件自己的全部可见文案。 */
    function copy() {
      if (isChinese()) return {
        label: "Chat DeepSeek",
        failed: "载入失败",
        fallbackNote: "这个 Harness 没有提供原生浏览器访客（桌面端才有），无法在窗口内显示官方页面。",
        fallbackAction: "在窗口中打开",
        fallbackOpened: "已打开 Chat DeepSeek",
        fallbackHanded: "已交给系统默认浏览器打开",
        fallbackFailed: "打开失败",
        refresh: "刷新 DeepSeek 页面",
      }
      if (isRussian()) return {
        label: "Chat DeepSeek",
        failed: "Не удалось загрузить",
        fallbackNote: "В этом Harness нет нативного браузерного гостя (он есть только в настольной версии), поэтому официальную страницу нельзя показать в окне.",
        fallbackAction: "Открыть в отдельном окне",
        fallbackOpened: "Chat DeepSeek открыт",
        fallbackHanded: "Передано браузеру по умолчанию",
        fallbackFailed: "Не удалось открыть",
        refresh: "Обновить DeepSeek",
      }
      return {
        label: "Chat DeepSeek",
        failed: "Could not load it",
        fallbackNote: "This Harness provides no native browser guest (only the desktop app does), so the official page cannot render in the window.",
        fallbackAction: "Open it in a window",
        fallbackOpened: "Chat DeepSeek is open",
        fallbackHanded: "Handed to the system default browser",
        fallbackFailed: "Could not open",
        refresh: "Refresh DeepSeek",
      }
    }

    /** 持久化补丁页的文案（独立于主面板文案，避免撑大 copy()）。 */
    function patchCopy() {
      if (isChinese()) return {
        title: "网页版登录补丁",
        intro: "DSH 每次升级都会覆盖 app.asar，右侧栏浏览器会退回内存分区，网页版登录随之丢失。下面的按钮会申请管理员权限，自动关闭 DSH、写入补丁并重新打开。",
        patched: "补丁在位",
        missing: "未打补丁：重启后会丢登录",
        unknown: "状态未知",
        asar: "归档",
        apply: "打补丁并重启",
        applying: "正在申请管理员权限…",
        check: "检查状态",
        launched: "已请求提权：请在 UAC 弹窗中确认，确认后 DSH 会自动关闭并重新打开。",
        already: "补丁已经在位，无需重复执行。",
        failed: "执行失败",
        note: "补丁只做 37 字节的等长替换，写入前会备份 app.asar.orig-bak；每次 DSH 升级后需要再点一次。",
        buttonTitle: "网页版登录补丁（升级后点一次）",
        patchedTitle: "补丁在位",
        confirm: "将申请管理员权限，关闭 DSH、写入持久分区补丁并重新打开。继续吗？",
        launchedShort: "已请求管理员权限，请在 UAC 弹窗中确认；确认后 DSH 会自动关闭并重新打开。",
        failedShort: "执行失败",
        manual: "这个环境里宿主无法自动提权（不能创建子进程）。请以管理员打开 PowerShell，粘贴下面的命令执行：",
        copied: "命令已复制到剪贴板。",
        notCopied: "剪贴板不可用，请手动复制下面的命令。",
      }
      return {
        title: "Web chat login patch",
        intro: "Every DSH upgrade replaces app.asar, which turns the sidebar browser guest back into a memory-only partition and drops the web chat login. This button asks for administrator rights, closes DSH, applies the patch and reopens the app.",
        patched: "Patch in place",
        missing: "Not patched: the login will not survive a restart",
        unknown: "Status unknown",
        asar: "Archive",
        apply: "Patch and restart",
        applying: "Requesting administrator rights…",
        check: "Check status",
        launched: "Elevation requested: confirm the UAC prompt; DSH will close and reopen by itself.",
        already: "The patch is already in place.",
        failed: "Failed",
        note: "Equal-length 37-byte replacement, backed up as app.asar.orig-bak; run it again after each DSH upgrade.",
        buttonTitle: "Web chat login patch (click after each upgrade)",
        patchedTitle: "Patch in place",
        confirm: "This will request administrator rights, close DSH, apply the persistent-partition patch and reopen the app. Continue?",
        launchedShort: "Administrator rights requested; confirm the UAC prompt and DSH will close and reopen by itself.",
        failedShort: "Failed",
        manual: "This host cannot elevate by itself (it cannot spawn a process). Open PowerShell as Administrator and paste this command:",
        copied: "Command copied to the clipboard.",
        notCopied: "Clipboard unavailable; copy the command below manually.",
      }
    }

    const CSS = [
      ".dsh-wc-host{width:100%;height:100%;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center}",
      "[" + OVERLAY_ATTR + "]{position:fixed;display:none;z-index:40}",
      "[" + OVERLAY_ATTR + "] webview{-webkit-app-region:no-drag;border:0;flex:auto;width:100%;min-width:0;height:100%;min-height:0;display:flex}",

      ".dsh-wc-message{max-width:460px;padding:22px;text-align:center;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-family)}",
      ".dsh-wc-action{margin-top:14px;padding:6px 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-elevated);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px;font-family:var(--dsw-font-family)}",
      ".dsh-wc-action[disabled]{opacity:.55;cursor:progress}",

      ".dsh-wc-footrow{display:flex;align-items:center;gap:4px;width:100%}",
      ".dsh-wc-foot{box-sizing:border-box;display:flex;flex:1 1 auto;min-width:0;align-items:center;gap:8px;height:28px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-family);text-align:left;cursor:pointer}",
      ".dsh-wc-foot:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dsh-wc-foot:focus-visible{outline:1px solid var(--dsw-alias-border-l3);outline-offset:1px}",
      ".dsh-wc-footlabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-wc-footicon{flex:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}",
      ".dsh-wc-footicon:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dsh-wc-footicon:disabled{opacity:.45;cursor:default}",
      ".dsh-wc-footicon:focus-visible{outline:1px solid var(--dsw-alias-border-l3);outline-offset:1px}",
      ".dsh-wc-footicon-ok{color:var(--dsw-alias-state-success-primary,#2e9e5b)}",
      ".dsh-wc-footicon-ok:hover:not(:disabled){color:var(--dsw-alias-state-success-primary,#2e9e5b)}",
      ".dsh-wc-footicon-ok:disabled{opacity:.9;cursor:default}",
      ".dsh-wc-footicon-warn{color:var(--dsw-alias-state-error-primary,#d64545)}",
      ".dsh-wc-footicon-warn:hover:not(:disabled){color:var(--dsw-alias-state-error-primary,#d64545)}",

      ".dsh-wc-patch{display:flex;flex-direction:column;gap:12px;padding:4px 2px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family)}",
      ".dsh-wc-patch p{margin:0;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary)}",
      ".dsh-wc-patch code{font-size:12px;color:var(--dsw-alias-label-primary);word-break:break-all}",
      ".dsh-wc-patch-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
      ".dsh-wc-badge{padding:2px 8px;border-radius:999px;font-size:12px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}",
      ".dsh-wc-badge-ok{border-color:currentColor;color:var(--dsw-alias-state-success-primary, #2e9e5b)}",
      ".dsh-wc-badge-warn{border-color:currentColor;color:var(--dsw-alias-state-warning-primary, #b26a00)}",
    ].join("\n")

    /** 桌面壳的浏览器桥；纯 Web profile 只有协议版本，走窗口降级。 */
    const carrier = globalThis.dshDesktop
    const bridge = carrier !== null && typeof carrier === "object" && carrier.protocolVersion === 1
      ? carrier.browser
      : undefined

    /** 活过面板生命周期的东西：访客记录、当前占据访客的 body、插件上下文。 */
    let guest = null
    let activeHost = null
    let acquiring = null
    let failure = ""
    let pluginCtx = null

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /** 把一段文本放进剪贴板；返回是否成功。 */
    function copyText(text) {
      try {
        if (typeof navigator === "object" && navigator.clipboard !== undefined
          && typeof navigator.clipboard.writeText === "function") {
          void navigator.clipboard.writeText(text)
          return true
        }
      } catch (error) {
        // 退回到 execCommand。
      }
      try {
        const area = document.createElement("textarea")
        area.value = text
        area.style.position = "fixed"
        area.style.opacity = "0"
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand("copy")
        area.remove()
        return ok === true
      } catch (error) {
        return false
      }
    }

    /** 注入样式表，并重写它——热替换后旧 CSS 不会盖住新几何。 */
    function ensureStyle() {
      let tag = document.getElementById(STYLE_ID)
      if (tag === null) {
        tag = document.createElement("style")
        tag.id = STYLE_ID
        document.head.appendChild(tag)
      }
      tag.textContent = CSS
    }

    /** 居中提示，可带一个动作按钮。 */
    function messageBox(text, action) {
      const box = document.createElement("div")
      box.className = "dsh-wc-message"
      box.textContent = text
      if (action !== undefined) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "dsh-wc-action"
        button.textContent = action.label
        button.addEventListener("click", async function () {
          if (button.disabled) return
          button.disabled = true
          try {
            await action.run(button)
          } finally {
            button.disabled = false
          }
        })
        box.appendChild(button)
      }
      return box
    }

    /** 请宿主半边在窗口里打开（无原生访客时的降级）。 */
    async function openInWindow(button) {
      const text = copy()
      const note = document.createElement("div")
      note.className = "dsh-wc-message"
      const settle = (message) => {
        note.textContent = message
        const parent = button.parentElement
        if (note.parentElement === null && parent !== null) parent.appendChild(note)
      }
      try {
        const response = await fetch(OPEN_ROUTE, { method: "POST", headers: { accept: "application/json" } })
        let payload = {}
        try { payload = await response.json() } catch (error) { payload = {} }
        if (payload.ok === true) {
          settle(String(payload.via) === "system-browser" ? text.fallbackHanded : text.fallbackOpened)
        } else {
          settle(text.fallbackFailed + "：" + String(payload.error || payload.via || "HTTP " + response.status))
        }
      } catch (error) {
        settle(text.fallbackFailed + "：" + messageOf(error))
      }
    }

    /** 回复里的弹窗外链交给系统浏览器。 */
    async function openExternalLink(url) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return
        url = parsed.href
        const response = await fetch(EXTERNAL_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        })
        const payload = await response.json()
        if (payload.ok !== true) {
          console.warn("[dsh-webchat-right] external link:", payload.error || "not opened")
        }
      } catch (error) {
        console.warn("[dsh-webchat-right] external link failed:", error)
      }
    }

    /** 文档根上的常驻容器，让访客不随面板卸载。 */
    function overlayContainer() {
      const existing = document.querySelector("[" + OVERLAY_ATTR + "]")
      if (existing !== null && existing !== undefined) return existing
      const box = document.createElement("div")
      box.setAttribute(OVERLAY_ATTR, "")
      document.body.appendChild(box)
      return box
    }

    /** 读页面自己能看到的一切：storage 与自己的 cookie 串。 */
    function readGuestState(element) {
      return element.executeJavaScript(
        "location.origin !== 'https://chat.deepseek.com' ? null : JSON.stringify({ origin: location.origin, storage: Object.keys(localStorage).filter(function (key) { return !/^(aws_waf|awswaf)/i.test(key) }).map(function (key) { return [key, localStorage.getItem(key)] }), cookie: document.cookie.split(';').map(function (pair) { return pair.trim() }).filter(function (pair) { return pair && !/^aws-waf-token=/i.test(pair) }).join('; ') })",
      )
    }

    /** 把页面态写回去；WAF 存储跳过。 */
    function writeGuestState(element, state) {
      return element.executeJavaScript(
        "(function () { if (location.origin !== 'https://chat.deepseek.com') return false; var state = " + JSON.stringify(state) + ";"
        + " var storage = Array.isArray(state.storage) ? state.storage : [];"
        + " for (var i = 0; i < storage.length; i++) { if (/^(aws_waf|awswaf)/i.test(storage[i][0])) continue; try { localStorage.setItem(storage[i][0], storage[i][1]) } catch (error) {} }"
        + " if (typeof state.cookie === 'string' && state.cookie !== '') {"
        + " var parts = state.cookie.split(';');"
        + " for (var j = 0; j < parts.length; j++) {"
        + " var pair = parts[j].trim();"
        + " if (pair.indexOf('=') === -1) continue;"
        + " try { document.cookie = pair + '; path=/' } catch (error) {}"
        + " } }"
        + " return true })()",
      )
    }

    /** 导航前把登录快照放回去。 */
    async function restoreGuestSession(partition) {
      try {
        const response = await fetch(RESTORE_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ partition }),
        })
        const payload = await response.json()
        if (payload === null || typeof payload !== "object") return null
        if (payload.ok !== true) {
          console.warn("[dsh-webchat-right] session cookies:", payload.error || "not restored")
        }
        const storage = Array.isArray(payload.storage) ? payload.storage : []
        const cookie = typeof payload.cookie === "string" ? payload.cookie : ""
        if (storage.length === 0 && cookie === "") return null
        return { storage, cookie }
      } catch (error) {
        console.warn("[dsh-webchat-right] session restore failed:", error)
        return null
      }
    }

    function onDeepSeek(element) {
      try { return new URL(element.getURL()).origin === "https://chat.deepseek.com" }
      catch (error) { return false }
    }

    /** 请宿主刷新快照。 */
    async function saveGuestSession(withState, target) {
      // 持久分区自己会落盘，写快照没有意义，还可能把旧状态留在磁盘上。
      if (PERSISTENT_PARTITION) return
      const record = target === undefined ? guest : target
      if (!record || !record.ready || !onDeepSeek(record.element)) return
      const body = { partition: record.partition }
      if (withState) {
        try {
          const state = JSON.parse(await readGuestState(record.element))
          if (!record.ready || !onDeepSeek(record.element) || !state || state.origin !== "https://chat.deepseek.com") return
          if (!Array.isArray(state.storage) || typeof state.cookie !== "string") return
          body.storage = state.storage
          body.cookie = state.cookie
        } catch (error) { return }
      }
      try {
        await fetch(SAVE_ROUTE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      } catch (error) {
        console.warn("[dsh-webchat-right] session save failed:", error)
      }
    }

    /** 预定访客并挂上 webview，整个进程只做一次。 */
    function ensureGuest() {
      if (guest !== null || bridge === undefined) return Promise.resolve()
      if (acquiring !== null) return acquiring
      acquiring = (async () => {
        try {
          const reservation = await bridge.acquire(STORAGE_IDENTITY)
          if (reservation === null || typeof reservation !== "object"
            || typeof reservation.lease !== "string" || typeof reservation.partition !== "string") {
            throw new Error("the desktop browser bridge returned no reservation")
          }
          // 持久分区不需要也不应该回灌快照：回灌会覆盖分区里已有的登录态，
          // 并触发一次 reload，表现就是"闪一下已登录又掉线"。
          const restored = PERSISTENT_PARTITION ? null : await restoreGuestSession(reservation.partition)
          const element = document.createElement("webview")
          element.setAttribute("name", reservation.lease)
          element.setAttribute("partition", reservation.partition)
          element.setAttribute("allowpopups", "")
          element.setAttribute("data-sidebar-browser-frame", "")
          element.setAttribute("src", "about:blank#" + reservation.lease)
          // 站点对 UA 里的 "electron" 字样会给「使用环境异常」；只摘这一个 token。
          const userAgent = typeof navigator === "object" && typeof navigator.userAgent === "string"
            ? navigator.userAgent.replace(/\s*Electron\/[\d.]+/i, "")
            : ""
          if (userAgent !== "") element.setAttribute("useragent", userAgent)
          element.addEventListener("dom-ready", function () {
            if (userAgent !== "") {
              try {
                element.setUserAgent(userAgent)
              } catch (error) {
                console.warn("[dsh-webchat-right] could not set the guest user agent:", error)
              }
            }
            element.loadURL(PAGE_URL).catch(function (error) {
              failure = messageOf(error)
            })
          }, { once: true })
          let storageState = restored === null ? "none" : "pending"
          const record = { lease: reservation.lease, partition: reservation.partition, element, ready: false }
          element.addEventListener("did-start-loading", function () { record.ready = false })
          element.addEventListener("did-finish-load", async function () {
            if (guest !== record || !onDeepSeek(element) || storageState === "restoring") return
            if (storageState === "pending") {
              storageState = "restoring"
              try {
                const applied = await writeGuestState(element, restored)
                if (guest !== record) return
                if (applied !== true || !onDeepSeek(element)) { storageState = "pending"; return }
                storageState = "reloading"
                element.reload()
              } catch (error) {
                storageState = "pending"
                console.warn("[dsh-webchat-right] could not restore site storage:", error)
              }
              return
            }
            storageState = "done"
            record.ready = true
            void saveGuestSession(true, record)
          })
          if (typeof bridge.onOpenRequested === "function") {
            record.unsubscribeOpen = bridge.onOpenRequested(reservation.lease, (url) => {
              if (guest === record) void openExternalLink(url)
            })
          }
          const onUnload = function () {
            if (!record.ready || !onDeepSeek(element)) return
            try { navigator.sendBeacon(SAVE_ROUTE, JSON.stringify({ partition: record.partition })) }
            catch (error) { /* The page is going away. */ }
          }
          window.addEventListener("beforeunload", onUnload)
          const container = overlayContainer()
          container.appendChild(element)

          record.container = container
          record.onUnload = onUnload
          record.timer = setInterval(function () { void saveGuestSession(true, record) }, SAVE_INTERVAL_MS)
          guest = record
          failure = ""
        } catch (error) {
          failure = messageOf(error)
        } finally {
          acquiring = null
        }
      })()
      return acquiring
    }

    /** 释放访客（插件卸载时）。 */
    function disposeGuest() {
      if (guest === null) return
      const releasing = guest
      guest = null
      activeHost = null
      if (releasing.timer !== undefined) clearInterval(releasing.timer)
      if (releasing.unsubscribeOpen) releasing.unsubscribeOpen()
      if (releasing.onUnload !== undefined) window.removeEventListener("beforeunload", releasing.onUnload)
      void saveGuestSession(true, releasing)
      releasing.container.remove()
      if (bridge !== undefined) {
        try { void bridge.release(releasing.lease) } catch (error) { /* already gone */ }
      }
    }

    /** 把访客摆到某个 body 的矩形上。 */
    function syncBounds(host) {
      if (guest === null) return
      const rect = host.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const style = guest.container.style
      style.left = rect.left + "px"
      style.top = rect.top + "px"
      style.width = rect.width + "px"
      style.height = rect.height + "px"
    }

    /** 这个 body 此刻是否真的画在屏幕上（收起、后台会话、未选中标签都算否）。 */
    function isReallyVisible(host) {
      if (host === null || !host.isConnected) return false
      if (typeof host.checkVisibility === "function") {
        try {
          return host.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
        } catch (error) { /* fall through */ }
      }
      return host.getClientRects().length > 0
    }

    /** 是不是我们自己把主栏切到了兜底页（用来在下次成功开 tab 时把会话还回来）。 */
    let fallbackSelected = false

    /**
     * 打开右侧栏里的这个标签页；没有可用右侧栏时退回主栏整页视图。
     *
     * 启动早期右侧栏服务可能还没挂上，或者 tab 类型还没注册完，所以先重试
     * 几次再退化——否则一次就退回主栏，正是"盖住会话"的那种表现。
     * @param attempt - 已重试次数（内部使用）。
     */
    function openChat(attempt) {
      const ctx = pluginCtx
      if (ctx === null) return
      const tries = typeof attempt === "number" ? attempt : 0
      try {
        const sidebarRight = typeof ctx.get === "function" ? ctx.get("sidebarRight") : ctx.sidebarRight
        if (sidebarRight !== undefined && sidebarRight !== null && typeof sidebarRight.openTab === "function") {
          sidebarRight.openTab(KIND)
          if (fallbackSelected) {
            fallbackSelected = false
            const layout = typeof ctx.get === "function" ? ctx.get("layout") : ctx.layout
            if (layout !== undefined && layout !== null && typeof layout.selectPanel === "function") {
              layout.selectPanel("conversation")
            }
          }
          return
        }
      } catch (error) {
        if (tries < 3) {
          setTimeout(function () { openChat(tries + 1) }, 250)
          return
        }
        console.warn("[dsh-webchat-right] right sidebar is unavailable:", messageOf(error))
      }
      if (tries < 3) {
        setTimeout(function () { openChat(tries + 1) }, 250)
        return
      }
      try {
        const layout = typeof ctx.get === "function" ? ctx.get("layout") : ctx.layout
        if (layout !== undefined && layout !== null && typeof layout.selectPanel === "function") {
          fallbackSelected = true
          layout.selectPanel(PANEL_ID)
        }
      } catch (error) {
        console.warn("[dsh-webchat-right] could not fall back to the main panel:", messageOf(error))
      }
    }

    /** F5 / Ctrl+R 刷新官方页面；拿不到快捷键服务就跳过。 */
    function installRefreshShortcuts(ctx) {
      const shortcuts = ctx.shortcuts || (typeof ctx.get === "function" ? ctx.get("shortcuts") : undefined)
      if (!shortcuts || typeof shortcuts.register !== "function") return () => {}
      const bindings = [{ code: "F5", modifiers: [] }, { code: "KeyR", modifiers: ["primary"] }]
      const disposers = []
      bindings.forEach(function (binding, index) {
        try {
          disposers.push(shortcuts.register({
            id: "webchat-right.refresh." + index,
            label: () => copy().refresh,
            aliases: [],
            defaults: { "desktop:windows": binding, "desktop:macos": binding, "desktop:linux": binding },
            regions: ["page", "editable"],
            modals: [],
            resolve: function (context) {
              const record = guest
              if (!record || record.container.style.display === "none" || context.modal !== null || context.region === "terminal") {
                return { status: "pass" }
              }
              return { status: "handled", run: function () {
                if (guest !== record || record.container.style.display === "none") return
                try { record.ready = false; record.element.reload() }
                catch (error) { console.warn("[dsh-webchat-right] reload failed:", error) }
              } }
            },
          }))
        } catch (error) {
          // 绑定冲突不能拖垮整个插件。
          console.error("[dsh-webchat-right] could not register the refresh shortcut:", error)
        }
      })
      return () => disposers.forEach((dispose) => {
        try { dispose() } catch (error) { /* already gone */ }
      })
    }

    /** 补丁按钮的图标：盾牌 + 对勾。 */
    function PatchIcon(props) {
      const size = props !== null && props !== undefined && typeof props.size === "number" ? props.size : 16
      return h("svg", {
        viewBox: "0 0 16 16",
        width: size,
        height: size,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.3,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
      },
        h("path", { d: "M8 2.2 13 4v4.2c0 2.9-2 4.9-5 5.6-3-.7-5-2.7-5-5.6V4z" }),
        h("path", { d: "M6 8.1 7.4 9.5 10.2 6.7" }),
      )
    }

    /**
     * 侧栏底部一列两格：左边 Chat DeepSeek，右边持久化补丁按钮。
     * 补丁按钮自带确认；已在位时置灰。
     */
    function FooterEntry(props) {
      const wide = props !== null && props !== undefined && props.wide === true
      const label = copy().label
      const patchText = patchCopy()
      const [patched, setPatched] = React.useState(null)

      React.useEffect(function () {
        let alive = true
        fetch(PATCH_STATUS_ROUTE, { headers: { accept: "application/json" } })
          .then(function (response) { return response.json() })
          .then(function (info) {
            if (!alive || info === null || typeof info !== "object") return
            // 只有明确的布尔值才算已知状态；接口异常时保持"未知"，不要误报红色。
            if (typeof info.patched === "boolean") setPatched(info.patched)
          })
          .catch(function () {
            // 状态读不到就保持未知，按钮仍可点击。
          })
        return function () { alive = false }
      }, [])

      const runPatch = function () {
        if (!window.confirm(patchText.confirm)) return
        fetch(PATCH_APPLY_ROUTE, { method: "POST", headers: { accept: "application/json" } })
          .then(function (response) { return response.json() })
          .then(function (payload) {
            if (payload !== null && payload !== undefined && payload.state === "patched") {
              setPatched(true)
              window.alert(patchText.already)
              return
            }
            if (payload !== null && payload !== undefined && payload.ok === true && payload.state === "launching") {
              window.alert(patchText.launchedShort)
              return
            }
            if (payload !== null && payload !== undefined && payload.state === "manual") {
              const command = typeof payload.command === "string"
                ? payload.command
                : 'powershell -ExecutionPolicy Bypass -File "' + String(payload.helper || "") + '"'
              const copied = copyText(command)
              window.alert(patchText.manual + "\n" + (copied ? patchText.copied : patchText.notCopied) + "\n\n" + command)
              return
            }
            const detail = payload === null || payload === undefined
              ? "unknown"
              : String(payload.error || payload.state || "unknown")
            const helper = payload !== null && payload !== undefined && typeof payload.helper === "string"
              ? payload.helper
              : ""
            const hint = helper === ""
              ? ""
              : "\n\n用管理员终端手动执行：\npowershell -ExecutionPolicy Bypass -File \"" + helper + "\""
            window.alert(patchText.failedShort + ": " + detail + hint)
          })
          .catch(function (error) {
            window.alert(patchText.failedShort + ": " + messageOf(error))
          })
      }

      const patchTitle = patched === true ? patchText.patchedTitle : patchText.buttonTitle
      // 在位置绿、缺失置红、状态未知保持中性灰。
      const patchTone = patched === true ? " dsh-wc-footicon-ok" : (patched === false ? " dsh-wc-footicon-warn" : "")

      return h("div", { className: "dsh-wc-footrow" },
        h("button", {
          type: "button",
          className: "dsh-wc-foot",
          title: label,
          "aria-label": label,
          onClick: function (event) {
            event.preventDefault()
            event.stopPropagation()
            openChat()
          },
        }, h(WebchatIcon, { size: 16 }), wide ? h("span", { className: "dsh-wc-footlabel" }, label) : null),
        h("button", {
          type: "button",
          className: "dsh-wc-footicon" + patchTone,
          title: patchTitle,
          "aria-label": patchTitle,
          disabled: patched === true,
          onClick: function (event) {
            event.preventDefault()
            event.stopPropagation()
            runPatch()
          },
        }, h(PatchIcon, { size: 16 })),
      )
    }

    /**
     * 一个承载访客的 body：右侧栏标签页与主栏兜底页共用。
     * 每帧检查自己是否真的可见，可见才把单例访客摆过来，否则让出。
     */
    function ChatBody() {
      const hostRef = React.useRef(null)

      React.useEffect(function () {
        const host = hostRef.current
        if (host === null || host === undefined) return undefined
        let alive = true
        let raf = 0

        const showFallback = function (text) {
          host.replaceChildren()
          host.appendChild(messageBox(text, {
            label: copy().fallbackAction,
            run: (button) => openInWindow(button),
          }))
        }

        if (bridge === undefined) {
          showFallback(copy().fallbackNote)
          return undefined
        }

        void ensureGuest().then(function () {
          if (!alive || guest === null) return
          host.replaceChildren()
        })

        const tick = function () {
          if (!alive) return
          if (guest !== null) {
            if (isReallyVisible(host)) {
              activeHost = host
              syncBounds(host)
              if (guest.container.style.display !== "block") guest.container.style.display = "block"
            } else if (activeHost === host) {
              activeHost = null
              guest.container.style.display = "none"
            }
          } else if (failure !== "") {
            showFallback(copy().failed + "：" + failure)
            return
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)

        return function () {
          alive = false
          if (raf !== 0) cancelAnimationFrame(raf)
          if (activeHost === host) {
            activeHost = null
            if (guest !== null) guest.container.style.display = "none"
          }
        }
      }, [])

      return h("div", { ref: hostRef, className: "dsh-wc-host" })
    }

    /** 入口图标：聊天气泡。 */
    function WebchatIcon(props) {
      const size = props !== null && props !== undefined && typeof props.size === "number" ? props.size : 16
      return h("svg", {
        viewBox: "0 0 16 16",
        width: size,
        height: size,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.3,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
      },
        h("path", { d: "M8 2.5a5.5 5.5 0 0 0-4.7 8.3L2.5 13.5l2.8-.8A5.5 5.5 0 1 0 8 2.5z" }),
        h("circle", { cx: 8, cy: 8, r: 1.1, fill: "currentColor", stroke: "none" }),
      )
    }

    /** 设置页：显示持久分区补丁状态，并一键提权执行。 */
    function PersistPatchPage() {
      const [state, setState] = React.useState({ phase: "loading", info: null, message: "" })

      const load = function () {
        fetch(PATCH_STATUS_ROUTE, { headers: { accept: "application/json" } })
          .then(function (response) { return response.json() })
          .then(function (info) { setState({ phase: "ready", info: info, message: "" }) })
          .catch(function (error) { setState({ phase: "error", info: null, message: messageOf(error) }) })
      }

      React.useEffect(function () {
        let alive = true
        fetch(PATCH_STATUS_ROUTE, { headers: { accept: "application/json" } })
          .then(function (response) { return response.json() })
          .then(function (info) { if (alive) setState({ phase: "ready", info: info, message: "" }) })
          .catch(function (error) { if (alive) setState({ phase: "error", info: null, message: messageOf(error) }) })
        return function () { alive = false }
      }, [])

      const run = function () {
        const text = patchCopy()
        setState({ phase: "applying", info: state.info, message: text.applying })
        fetch(PATCH_APPLY_ROUTE, { method: "POST", headers: { accept: "application/json" } })
          .then(function (response) { return response.json() })
          .then(function (payload) {
            if (payload !== null && payload.state === "patched") {
              setState({ phase: "ready", info: payload, message: text.already })
              return
            }
            if (payload !== null && payload.ok === true && payload.state === "launching") {
              setState({ phase: "ready", info: state.info, message: text.launched })
              return
            }
            if (payload !== null && payload.state === "manual") {
              const command = typeof payload.command === "string"
                ? payload.command
                : 'powershell -ExecutionPolicy Bypass -File "' + String(payload.helper || "") + '"'
              const copied = copyText(command)
              setState({
                phase: "ready",
                info: state.info,
                message: text.manual + " " + (copied ? text.copied : text.notCopied) + "\n" + command,
              })
              return
            }
            const detail = payload === null || payload === undefined
              ? "unknown"
              : String(payload.error || payload.state || "unknown")
            setState({ phase: "ready", info: state.info, message: text.failed + ": " + detail })
          })
          .catch(function (error) {
            setState({ phase: "ready", info: state.info, message: text.failed + ": " + messageOf(error) })
          })
      }

      const text = patchCopy()
      const info = state.info
      const patched = info !== null && info !== undefined && info.patched === true
      const statusText = state.phase === "error" ? text.unknown : (patched ? text.patched : text.missing)
      const badgeClass = "dsh-wc-badge " + (patched ? "dsh-wc-badge-ok" : "dsh-wc-badge-warn")

      return h("div", { className: "dsh-wc-patch" },
        h("div", { className: "dsh-wc-patch-row" },
          h("span", { className: badgeClass }, statusText),
          info !== null && info !== undefined && typeof info.asar === "string"
            ? h("code", null, info.asar)
            : null,
        ),
        h("p", null, text.intro),
        h("div", { className: "dsh-wc-patch-row" },
          h("button", {
            type: "button",
            className: "dsh-wc-action",
            disabled: state.phase === "applying" || patched,
            onClick: function () { run() },
          }, state.phase === "applying" ? text.applying : text.apply),
          h("button", {
            type: "button",
            className: "dsh-wc-action",
            onClick: function () { load() },
          }, text.check),
        ),
        state.message !== "" ? h("p", null, state.message) : null,
        h("p", null, text.note),
      )
    }

    /** 某一步失败时记日志并继续，绝不让插件激活失败拖垮前端启动。 */
    function safely(label, run) {
      try {
        return run()
      } catch (error) {
        console.error("[dsh-webchat-right] " + label + " failed:", error)
        return () => {}
      }
    }

    /** 注册底部入口、右侧栏标签页（含兜底主栏页），并接管访客生命周期。 */
    function apply(ctx) {
      pluginCtx = ctx

      safely("stylesheet", function () { ensureStyle() })

      safely("refresh shortcuts", function () {
        ctx.effect(() => installRefreshShortcuts(ctx), "webchat-right: refresh shortcuts")
      })

      // 底部入口：侧栏 foot、Settings 旁、账户头像之上那一带。
      safely("footer entry", function () {
        ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
          name: "sidebar.footer.action",
          id: FOOTER_ID,
          order: 5,
          label: () => copy().label,
        }, FooterEntry))
      })

      // 设置页：持久分区补丁的状态与一键执行。
      safely("persist patch section", function () {
        ctx.slots.inject("settings.section", () => ctx.slots.register({
          name: "settings.section",
          id: "webchat-right-persist",
          order: 60,
          label: () => patchCopy().title,
        }, PersistPatchPage))
      })

      // 右侧栏标签页：类型声明 + body 一起注册，随插件卸载一起撤销。
      //
      // `sidebarRightTabs` 在启动早期可能还没挂上（插件 apply 先于右侧栏初始化），
      // 所以这里不能只查一次：轮询到它出现再注册，最多等约 30 秒。
      safely("right-sidebar tab", function () {
        let disposed = false
        let tries = 0
        let disposeAll = function () {}
        const timer = setInterval(function () {
          if (disposed) return
          const registry = typeof ctx.get === "function" ? ctx.get("sidebarRightTabs") : ctx.sidebarRightTabs
          if (registry === undefined || registry === null || typeof registry.register !== "function") {
            tries += 1
            if (tries > 120) {
              clearInterval(timer)
              console.warn("[dsh-webchat-right] no sidebarRightTabs registry; the entry will fall back to the main panel")
            }
            return
          }
          clearInterval(timer)
          try {
            const disposeType = registry.register({
              id: TAB_TYPE_ID,
              kind: KIND,
              title: () => copy().label,
              keepMounted: true,
            })
            const disposeBody = ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
              name: "sidebar.right.pane.tab",
              key: TAB_TYPE_ID,
            }, ChatBody))
            disposeAll = function () {
              try { disposeBody() } catch (error) { /* already gone */ }
              try { disposeType() } catch (error) { /* already gone */ }
            }
          } catch (error) {
            console.error("[dsh-webchat-right] could not register the right-sidebar tab:", error)
          }
        }, 250)
        ctx.effect(() => () => {
          disposed = true
          clearInterval(timer)
          disposeAll()
        }, "webchat-right: right-sidebar tab")
      })

      // 兜底：右侧栏不可用（无会话、全局面板）时退回整页视图。
      safely("fallback panel", function () {
        ctx.slots.inject("main", () => ctx.slots.register({
          name: "main",
          key: PANEL_ID,
        }, ChatBody))
      })

      safely("guest disposal", function () {
        ctx.effect(() => () => {
          disposeGuest()
        }, "webchat-right: native guest")
      })
    }

    return { inject: ["slots"], apply }
  },
})
