# dsh-webchat-right — Usage

This plugin connects the DeepSeek web chat into the DeepSeek Harness desktop right sidebar, and provides a persistent-partition patch so login survives restarts.

## 1. Install the plugin

### Prerequisites

- DeepSeek Harness 0.2.x desktop app (Electron)
- `@jaychang1989/dsh-webchat` already installed (the host half depends on it for login snapshot and external-link routing)

### Installation steps

1. **Copy the plugin directory**

   Copy the whole `dsh-webchat-right/` directory into your DSH profile's `node_modules/`:

   ```powershell
   # Example (Windows):
   Copy-Item -Path ".\dsh-webchat-right" -Destination "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@local\" -Recurse -Force
   ```

   Linux/macOS:

   ```bash
   cp -r dsh-webchat-right ~/.dsh/profiles/desktop/node_modules/@local/
   ```

2. **Add Cordis patch**

   Append to your profile's `cordis.patch.yml`:

   ```yaml
   - insert:
       - id: webchat-right
         name: '@local/dsh-webchat-right'
   ```

   Example path: `$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml`

3. **Restart DSH**

   Close DeepSeek Harness and reopen it.

4. **Verify**

   Open the DSH web UI. The **Chat DeepSeek** button should appear at the bottom of the left sidebar (above Settings, above the account avatar).

   Click it and the right sidebar should open a tab showing `https://chat.deepseek.com/`.

## 2. Usage

### Opening Chat DeepSeek

- Click the **Chat DeepSeek** button at the bottom of the left sidebar.
- The right sidebar opens (or focuses) a DeepSeek tab. The conversation list is squeezed rather than covered.
- Clicking again focuses the existing tab without opening a duplicate.
- Collapsing the sidebar or switching to another tab only hides the page; it does not reload, and login state is preserved.

### Refreshing the page

Inside the panel, press **F5** or **Ctrl+R** (macOS: **⌘+R**) to refresh the official DeepSeek page.

### Fallback to main panel

If the right sidebar service is unavailable (no session, global panel mode, etc.), clicking the entry falls back to a full-page view in the main column.

## 3. Persistent-partition patch (keep login across restarts)

### Why the patch is needed

DSH desktop gives every sidebar browser guest a process-level, randomly-named partition:

```
partition = `dsh-sidebar-browser-${randomUUID()}`
```

Cookies die with the process, so a restart loses the web chat login.

The patch replaces that statement with an equal-length one:

```
partition = "persist:"+workspace.replace(/:/g,"")
```

The partition name becomes fixed as `persist:dsh-webchat-right`, so cookies and localStorage are persisted to disk and login survives restarts.

### Status indicator

The shield icon on the bottom-right of the sidebar footer shows patch status:

| Color | Meaning | Action |
|-------|---------|--------|
| 🟢 Green (checkmark) | Patch in place | Disabled; no need to run again |
| 🔴 Red | Not patched | Click to apply |
| ⚪ Gray | Unknown | Interface error; button still clickable |

### Applying the patch

1. Click the shield icon; a confirmation dialog appears.
2. Confirm; the plugin attempts to auto-elevate:
   - **Normal environment**: DSH closes, patch is written, DSH reopens automatically.
   - **Restricted environment** (host cannot spawn processes): a command is copied to your clipboard. Open **PowerShell as Administrator**, paste, and run it.
3. After success, DSH closes and reopens automatically.
4. Sign in to DeepSeek web chat once, then restart DSH to verify login persists.

### After every DSH upgrade

DSH upgrades replace `app.asar`, which removes the patch. Run the patch again after each upgrade, otherwise login will not survive restarts.

## 4. Running the PowerShell scripts directly (alternative)

If auto-elevation is unavailable or the plugin UI is inconvenient, run the PowerShell scripts directly from the repository.

### Script locations

- `scripts/apply-persist.ps1` — one-click apply patch (recommended)
- `scripts/persist-partition.ps1` — probe / patch / restore tool (fine-grained control)

### How to run

Both scripts must run from **PowerShell as Administrator**.

```powershell
# 1. One-click apply patch (closes DSH, writes patch, reopens DSH)
powershell -ExecutionPolicy Bypass -File ".\scripts\apply-persist.ps1"

# 2. Probe current status only (read-only)
powershell -ExecutionPolicy Bypass -File ".\scripts\persist-partition.ps1"

# 3. Apply patch (DSH must be closed first; admin required)
powershell -ExecutionPolicy Bypass -File ".\scripts\persist-partition.ps1 -Patch"

# 4. Restore from backup
powershell -ExecutionPolicy Bypass -File ".\scripts\persist-partition.ps1 -Restore"
```

### Notes

- The patch is an **equal-length 37-byte replacement**; a backup is written to `app.asar.orig-bak` before writing.
- Close DSH before patching (or let the script close it).
- DSH upgrades replace `app.asar`; you must re-patch after each upgrade.
- After restoring, if you previously enabled persistent partition, set `PERSISTENT_PARTITION` back to `false` before restarting, otherwise the page will try to restore an old snapshot onto a non-persistent partition and show "flash logged in then drop offline".

## 5. Known limitations

1. **Right-sidebar layout is saved per session.** Opening a session that never had this tab requires clicking the entry once.
2. **Singleton guest contention.** With `keepMounted`, the same kind visible in two panes at once may fight over the single guest (rare; page jumps between sides). Not handled in v1.
3. **Does not track upstream updates.** This fork does not automatically merge `@jaychang1989/dsh-webchat` npm updates; DSH upgrades may require re-aligning the slot contract.
4. **Elevation restrictions.** If the host cannot spawn processes (restricted Job / AppContainer), auto-elevation silently fails and falls back to manually running the copied command.

## 6. License

Apache-2.0. See `NOTICE` and the upstream repository.

Original author: `@jaychang1989` — upstream: `https://github.com/jaychang1989/dsh-webchat`