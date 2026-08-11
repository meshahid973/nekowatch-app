import { app } from "electron"
import log from "electron-log/main"
import { toElectronGpuPreference } from "./gpu-preference"

export function setupChromiumFlags() {
    app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
    app.commandLine.appendSwitch("disk-cache-size", (400 * 1000 * 1000).toString())
    app.commandLine.appendSwitch("force-effective-connection-type", "4g")

    // NekoWatch Desktop stability mode for Windows.
    //
    // Upstream Denshi enables a large set of experimental/forced Chromium GPU
    // switches at the same time (zero-copy, hardware overlays, OOP raster,
    // Skia renderer, unsafe WebGPU and ignore-gpu-blocklist). On some Windows
    // GPU/driver combinations this presents as stale rectangles, flashing
    // surfaces and sections of the React UI repainting at the wrong size.
    //
    // mpv-prism is a native player and is not dependent on Chromium compositing,
    // so prefer a stable Electron shell here. Developers can temporarily opt
    // back into Chromium GPU acceleration for comparison with:
    // NEKOWATCH_ENABLE_CHROMIUM_GPU=1
    const useChromiumGpu = process.env.NEKOWATCH_ENABLE_CHROMIUM_GPU === "1"

    if (process.platform === "win32" && !useChromiumGpu) {
        log.info("[NekoWatch] Windows renderer stability mode enabled (Chromium hardware acceleration disabled)")
        app.disableHardwareAcceleration()

        // Keep only non-renderer behavioural feature overrides on Windows.
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

    // Preserve the upstream accelerated path for non-Windows platforms and for
    // explicit Windows diagnostics via NEKOWATCH_ENABLE_CHROMIUM_GPU=1.
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
