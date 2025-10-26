const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

// Make the app more robust: try to load a real renderer (file or dev server),
// otherwise fallback to a minimal data URL so packaging and smoke tests work.
// NOTE: This is a temporary placeholder main added to allow packaging and testing
// of translation/locales and Windows installers. For production, replace this
// with the project's real main entry that wires up IPC, preload scripts, and
// actual renderer startup logic.
function createWindow() {
    // Windows need an AppUserModelID for notifications and proper behavior
    try {
        if (process.platform === 'win32') app.setAppUserModelId('com.cherry.studio')
    } catch (e) {
        // ignore
    }

    const win = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        // icon will be picked from build/icon.ico if present in packaged app
        icon: path.join(__dirname, '..', '..', 'build', 'icon.ico')
    })

    // Strategy to pick what to load:
    // 1) If ELECTRON_START_URL env is set (dev), use it
    // 2) If packaged index.html exists in renderer, load it
    // 3) If localhost:3000 is responding, try it (common dev server)
    // 4) Fallback to minimal data URL
    let loadUrl = null
    if (process.env.ELECTRON_START_URL) {
        loadUrl = process.env.ELECTRON_START_URL
    } else {
        const packagedIndex = path.join(__dirname, '..', 'renderer', 'index.html')
        if (fs.existsSync(packagedIndex)) {
            loadUrl = 'file://' + packagedIndex
        }
    }

    // Try localhost dev server if nothing found yet
    const tryLocalhost = async () => {
        if (loadUrl) return loadUrl
        try {
            const res = await fetch('http://localhost:3000', { method: 'HEAD', mode: 'no-cors' })
            // If fetch succeeds, prefer local dev server
            loadUrl = 'http://localhost:3000'
        } catch (e) {
            // ignore, fallback later
        }
        return loadUrl
    }

    Promise.resolve()
        .then(tryLocalhost)
        .then(() => {
            if (!loadUrl) {
                const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cherry Studio</title></head><body><h2>Cherry Studio (placeholder)</h2><p>If you see this, the app started successfully.</p></body></html>`
                win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
            } else {
                win.loadURL(loadUrl)
            }
        })
        .catch(() => {
            const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cherry Studio</title></head><body><h2>Cherry Studio (placeholder)</h2><p>If you see this, the app started successfully.</p></body></html>`
            win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
        })
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
