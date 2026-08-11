import type { ParsedLocation } from "@tanstack/react-router"

const SCROLLED_TRANSITION_THRESHOLD = 8
let hasSkippedInitialDenshiTransition = false

type ViewTransitionInfo = {
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
}

type DenshiViewTransition = false | {
    types: (info: ViewTransitionInfo) => Array<string> | false
}

export function getDenshiViewTransition(): DenshiViewTransition {
    // NekoWatch Desktop intentionally disables document View Transitions.
    // Chromium snapshots large route surfaces for this API; together with the
    // Electron compositor this can produce stale/duplicated rectangles during
    // repaints on some Windows GPU/driver combinations. Normal React routing is
    // fast enough and avoids the extra composited snapshot surfaces entirely.
    const enabled = false

    if (typeof document !== "undefined") {
        document.documentElement.toggleAttribute("data-denshi-view-transitions", enabled)
    }

    if (!enabled) return false

    return {
        types: getDenshiViewTransitionTypes,
    }
}

function getDenshiViewTransitionTypes(info: ViewTransitionInfo) {
    if (!hasSkippedInitialDenshiTransition) {
        hasSkippedInitialDenshiTransition = true
        return false
    }

    const fromLocation = info.fromLocation
    const fromPath = fromLocation?.pathname || "/"
    const toPath = info.toLocation.pathname

    if (!info.hrefChanged) return false

    if (info.hashChanged && !info.pathChanged && fromLocation?.searchStr === info.toLocation.searchStr) {
        return false
    }

    if (isFixedHeavyPath(fromPath) || isFixedHeavyPath(toPath)) return false

    // Prevent view transitions when the mpv-prism video player is active.
    if (typeof document !== "undefined" && document.querySelector("[data-mpv-prism-video]")) {
        return false
    }

    resetScrolledTransition(info, fromPath, toPath)

    return ["sea-denshi-route"]
}

function resetScrolledTransition(info: ViewTransitionInfo, fromPath: string, toPath: string) {
    if (!hasRouteSurfaceChanged(info, fromPath, toPath)) return
    if (typeof window === "undefined") return
    if (window.scrollY <= SCROLLED_TRANSITION_THRESHOLD && window.scrollX <= SCROLLED_TRANSITION_THRESHOLD) return

    window.scrollTo({ top: 0, left: 0, behavior: "smooth" })
}

function hasRouteSurfaceChanged(info: ViewTransitionInfo, fromPath: string, toPath: string) {
    if (info.pathChanged) return true
    if (isEntryPath(fromPath) && isEntryPath(toPath)) return true
    return false
}

function isEntryPath(pathname: string) {
    return pathname === "/entry" || pathname === "/manga/entry"
}

function isFixedHeavyPath(pathname: string) {
    return pathname.startsWith("/mediastream") ||
        pathname.startsWith("/webview") ||
        pathname.startsWith("/splashscreen")
}
