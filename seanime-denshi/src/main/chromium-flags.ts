import { app } from "electron"
import log from "electron-log/main"
import { toElectronGpuPreference } from "./gpu-preference"

export function setupChromiumFlags() {
    app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
    app.commandLine.appendSwitch("disk-cache-size", (400 * 1000 * 1000).toString())
    app.commandLine.appendSwitch("force-effective-connection-type", "4g")

    // NekoWatch Desktop: Windows uses software compositing for the Electron UI
    // shell by default. On the affected Windows setup, enabling Chromium GPU
    // acceleration reproducibly brings back stale rectangles / CSS flashing,
    // even after removing the upstream forced renderer experiments.
    //
    // mpv-prism remains a separate native playback path, so this only trades UI
    // shell acceleration for stability. If we need to diagnose Chromium GPU
    // rendering again, set NEKOWATCH_ENABLE_CHROMIUM_GPU=1 before launch.
    if (process.platform === "win32") {
        const enableChromiumGpu = process.env.NEKOWATCH_ENABLE_CHROMIUM_GPU === "1"

        if (!enableChromiumGpu) {
            log.info("[NekoWatch] Windows stable renderer enabled (Chromium hardware acceleration disabled)")
            app.disableHardwareAcceleration()
        } else {
            log.info("[NekoWatch] Windows Chromium GPU diagnostics enabled")

            const gpuPreference = toElectronGpuPreference(process.env.MPV_PRISM_HIGH_PERFORMANCE_GPU)
            if (gpuPreference === "high-performance") {
                app.commandLine.appendSwitch("force_high_performance_gpu")
            }
            if (gpuPreference === "low-power") {
                app.commandLine.appendSwitch("force_low_power_gpu")
            }
        }

        app.commandLine.appendSwitch("disable-features", [
            "WebContentsForceDarkMode",
            "HardwareMediaKeyHandling",
            "CalculateNativeWinOcclusion",
        ].join(","))

        app.commandLine.appendSwitch("disable-background-timer-throttling")
        app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")
        app.commandLine.appendSwitch("disable-renderer-backgrounding")
        app.commandLine.appendSwitch("disable-background-media-suspend")
        return
    }

    // Preserve the upstream accelerated path on macOS/Linux for now.
    app.commandLine.appendSwitch("no-zygote")

    const gpuPreference = toElectronGpuPreference(process.env.MPV_PRISM_HIGH_PERFORMANCE_GPU)
    if (gpuPreference === "high-performance") {
        app.commandLine.appendSwitch("force_high_performance_gpu")
    }

    if (gpuPreference === "low-power") {
        app.commandLine.appendSwitch("force_low_power_gpu")
    }

    app.commandLine.appendSwitch("disable-features", [
        "WidgetLayering",
        "ColorProviderRedirection",
        "WebContentsForceDarkMode",
        "HardwareMediaKeyHandling",
        "CalculateNativeWinOcclusion",
    ].join(","))

    app.commandLine.appendSwitch("enable-zero-copy")
    app.commandLine.appendSwitch("enable-hardware-overlays", "single-fullscreen,single-on-top,underlay")
    app.commandLine.appendSwitch("ignore-gpu-blocklist")
    app.commandLine.appendSwitch("enable-accelerated-video-decode")

    app.commandLine.appendSwitch("enable-features", [
        "WebAssemblyLazyCompilation",
        "ThrottleDisplayNoneAndVisibilityHiddenCrossOriginIframes",
        "CanvasOopRasterization",
        "UseSkiaRenderer",
        "PlatformEncryptedDolbyVision",
        "SharedArrayBuffer",
    ].join(","))

    app.commandLine.appendSwitch("enable-unsafe-webgpu")
    app.commandLine.appendSwitch("enable-gpu-rasterization")
    app.commandLine.appendSwitch("enable-oop-rasterization")

    app.commandLine.appendSwitch("disable-background-timer-throttling")
    app.commandLine.appendSwitch("disable-backgrounding-occluded-windows")
    app.commandLine.appendSwitch("disable-renderer-backgrounding")
    app.commandLine.appendSwitch("disable-background-media-suspend")

    app.commandLine.appendSwitch("double-buffer-compositing")
    app.commandLine.appendSwitch("disable-direct-composition-video-overlays")

    if (process.platform === "linux") {
        log.info("Passing --gtk-version=3 to Electron")
        app.commandLine.appendSwitch("gtk-version", "3")
    }
}
