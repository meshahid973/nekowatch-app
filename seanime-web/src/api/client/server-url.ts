import { __DEV_SERVER_PORT } from "@/lib/server/config"
import { __isDesktop__ } from "@/types/constants"

function devOrProd(dev: string, prod: string): string {
    return import.meta.env.MODE === "development" ? dev : prod
}

function isStaticElectronDevFrontend(): boolean {
    if (typeof window === "undefined") return false

    const hostname = window.location.hostname
    return (hostname === "127.0.0.1" || hostname === "localhost") && window.location.port === "43210"
}

export function getServerBaseUrl(removeProtocol: boolean = false): string {
    if (__isDesktop__) {
        // NekoWatch desktop development serves a compiled/static Denshi build on
        // 127.0.0.1:43210 to avoid Rsbuild HMR/compositor instability. A static
        // `rsbuild build` has MODE=production, so MODE alone cannot identify the
        // development sidecar. Electron development always serves that frontend
        // on :43210 and launches the Go sidecar on :43000.
        //
        // Packaged builds keep using the production sidecar on :43211.
        const isStaticDev = isStaticElectronDevFrontend()
        let ret = isStaticDev
            ? `http://127.0.0.1:${__DEV_SERVER_PORT}`
            : devOrProd(`http://127.0.0.1:${__DEV_SERVER_PORT}`, "http://127.0.0.1:43211")

        if (removeProtocol) {
            ret = ret.replace("http://", "").replace("https://", "")
        }
        return ret
    }

    // DEV ONLY: Hack to allow multiple development servers for the same web server
    // localhost:43210 -> 127.0.0.1:43001
    // 192.168.1.100:43210 -> 127.0.0.1:43002
    // if (import.meta.env.MODE === "development" && window.location.host.includes("localhost")) {
    //     let ret = `http://127.0.0.1:${TESTONLY__DEV_SERVER_PORT2}`
    //     if (removeProtocol) {
    //         ret = ret.replace("http://", "").replace("https://", "")
    //     }
    //     return ret
    // }
    // if (import.meta.env.MODE === "development" && window.location.host.startsWith("192.168")) {
    //     let ret = `http://127.0.0.1:${TESTONLY__DEV_SERVER_PORT3}`
    //     if (removeProtocol) {
    //         ret = ret.replace("http://", "").replace("https://", "")
    //     }
    //     return ret
    // }

    let ret = typeof window !== "undefined"
        ? (`${window?.location?.protocol}//` + devOrProd(`${window?.location?.hostname}:${__DEV_SERVER_PORT}`, window?.location?.host))
        : ""
    if (removeProtocol) {
        ret = ret.replace("http://", "").replace("https://", "")
    }
    return ret
}
