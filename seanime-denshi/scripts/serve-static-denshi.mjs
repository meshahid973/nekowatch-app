import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, "../../seanime-web/out-denshi")
const host = "127.0.0.1"
const port = 43210

const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}

if (!fs.existsSync(path.join(root, "index.html"))) {
    console.error(`[NekoWatch] Static Denshi build not found: ${root}`)
    console.error("Run `npm run build:denshi` inside seanime-web first.")
    process.exit(1)
}

function sendFile(res, filePath) {
    const extension = path.extname(filePath).toLowerCase()
    const contentType = mimeTypes[extension] || "application/octet-stream"

    res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Cross-Origin-Opener-Policy": "same-origin",
    })

    fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
    try {
        const requestUrl = new URL(req.url || "/", `http://${host}:${port}`)
        let pathname = decodeURIComponent(requestUrl.pathname)

        if (pathname === "/") pathname = "/index.html"

        const requestedPath = path.resolve(root, `.${pathname}`)
        const relativePath = path.relative(root, requestedPath)
        const isInsideRoot = relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))

        if (!isInsideRoot) {
            res.writeHead(403)
            res.end("Forbidden")
            return
        }

        if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
            sendFile(res, requestedPath)
            return
        }

        // TanStack Router SPA fallback.
        if (!path.extname(pathname) || pathname.endsWith(".html")) {
            sendFile(res, path.join(root, "index.html"))
            return
        }

        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        res.end("Not Found")
    }
    catch (error) {
        console.error("[NekoWatch] Static frontend request failed:", error)
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
        res.end("Internal Server Error")
    }
})

server.on("error", error => {
    if (error?.code === "EADDRINUSE") {
        console.error(`[NekoWatch] Port ${port} is already in use. Stop the old Rsbuild/dev server first.`)
    } else {
        console.error("[NekoWatch] Static frontend server failed:", error)
    }
    process.exit(1)
})

server.listen(port, host, () => {
    console.log(`[NekoWatch] Static Denshi frontend: http://${host}:${port}`)
    console.log(`[NekoWatch] Serving: ${root}`)
    console.log("[NekoWatch] HMR/file watching: OFF")
})

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        server.close(() => process.exit(0))
    })
}
