import { useIsSimulatedUser } from "@/app/(main)/_hooks/use-server-status"
import { ClientProviders, queryClient, store } from "@/app/client-providers"
import "./app/globals.css"
import "./app/nekowatch-electron-control-fixes.css"
import { __navigationPreloadModeAtom, getActualNavigationPreloadMode, NavigationPreloadMode } from "@/lib/navigation-preload-settings"
import { __isElectronDesktop__ } from "@/types/constants"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { useAtomValue } from "jotai/react"
import React from "react"
import ReactDOM from "react-dom/client"
import { ErrorBoundary, FallbackProps } from "react-error-boundary"
import { LuffyError } from "./components/shared/luffy-error"
import { Button } from "./components/ui/button"
import { setupDenshiScrollRestoration } from "./lib/router/denshi-scroll-restoration"
import { getDenshiViewTransition } from "./lib/router/view-transitions"
import { routeTree } from "./routeTree.gen"
import "@fontsource-variable/inter/index.css"

type RouterPreloadMode = false | "intent" | "viewport"

function createAppRouter(defaultPreload: RouterPreloadMode, defaultPreloadDelay?: number) {
    const viewTransition = getDenshiViewTransition()
    const router = createRouter({
        routeTree,
        defaultPreload,
        defaultPreloadDelay,
        context: {
            queryClient,
            store,
        },
        scrollRestoration: false,
        defaultViewTransition: viewTransition,
        defaultPreloadStaleTime: 30 * 1000,
    })

    if (viewTransition) {
        setupDenshiScrollRestoration(router)
    }

    return router
}

type AppRouter = ReturnType<typeof createAppRouter>

const intentRouter = createAppRouter("intent")
const fasterIntentRouter = createAppRouter("intent", 0)
const viewportRouter = createAppRouter("viewport")
const disabledRouter = createAppRouter(false)

const routersByPreloadMode: Record<NavigationPreloadMode, AppRouter> = {
    disable: disabledRouter,
    default: intentRouter,
    faster: fasterIntentRouter,
    viewport: viewportRouter,
}

declare module "@tanstack/react-router" {
    interface Register {
        router: AppRouter
    }
}

function AppRouterProvider() {
    const _preloadMode = useAtomValue(__navigationPreloadModeAtom)
    const isSimulatedUser = useIsSimulatedUser()
    const preloadMode = getActualNavigationPreloadMode(_preloadMode, isSimulatedUser)

    return <RouterProvider router={routersByPreloadMode[preloadMode]} />
}

function NekoWatchBranding() {
    React.useEffect(() => {
        const normalizeTitle = () => {
            const current = document.title.trim()
            if (!current || current === "Seanime" || current === "Seanime Denshi" || current === "Denshi") {
                document.title = "NekoWatch App"
                return
            }

            const branded = current
                .replace(/\s*\|\s*Seanime Denshi$/i, " | NekoWatch App")
                .replace(/\s*\|\s*Seanime$/i, " | NekoWatch App")
                .replace(/\s*\|\s*Denshi$/i, " | NekoWatch App")

            if (branded !== current) document.title = branded
        }

        const replaceBrandText = (text: string) => {
            return text
                .replace(/Seanime Denshi/g, "NekoWatch App")
                .replace(/•\s*Denshi/g, "• NekoWatch App Edition")
                .replace(/^Denshi$/g, "NekoWatch App")
                .replace(/^Seanime$/g, "NekoWatch App")
        }

        const normalizeTextNode = (node: Node) => {
            if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue) return
            const parent = node.parentElement
            if (!parent || ["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"].includes(parent.tagName)) return

            const next = replaceBrandText(node.nodeValue)
            if (next !== node.nodeValue) node.nodeValue = next
        }

        const normalizeVisibleBranding = (root: Node) => {
            normalizeTextNode(root)
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
            let node = walker.nextNode()
            while (node) {
                normalizeTextNode(node)
                node = walker.nextNode()
            }
        }

        normalizeTitle()
        normalizeVisibleBranding(document.body)

        const titleElement = document.querySelector("title")
        const titleObserver = titleElement ? new MutationObserver(normalizeTitle) : null
        titleObserver?.observe(titleElement!, { childList: true, subtree: true, characterData: true })

        const bodyObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === "characterData") {
                    normalizeTextNode(mutation.target)
                    continue
                }
                for (const node of mutation.addedNodes) normalizeVisibleBranding(node)
            }
        })
        bodyObserver.observe(document.body, { childList: true, subtree: true, characterData: true })

        return () => {
            titleObserver?.disconnect()
            bodyObserver.disconnect()
        }
    }, [])

    return null
}

function DesktopStartupReady() {
    React.useEffect(() => {
        if (!__isElectronDesktop__ || window.location.pathname.startsWith("/splashscreen") || !window.electron?.startup?.ready) {
            return
        }

        let sent = false
        let ff = 0
        let sf = 0
        let fallbackId = 0

        const sendReady = () => {
            if (sent) return

            sent = true
            window.electron?.startup?.ready()
        }

        ff = window.requestAnimationFrame(() => {
            sf = window.requestAnimationFrame(() => {
                sendReady()
            })
        })

        fallbackId = window.setTimeout(() => {
            sendReady()
        }, 500)

        return () => {
            window.cancelAnimationFrame(ff)
            window.cancelAnimationFrame(sf)
            window.clearTimeout(fallbackId)
        }
    }, [])

    return null
}

function RootErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    return (
        <div className="min-h-screen bg-[#0c0c0c] text-white flex items-center justify-center p-6">
            <div className="w-full max-w-lg rounded-2xl border bg-black/60 p-6 text-center backdrop-blur-sm space-y-4">
                <LuffyError title="NekoWatch App error">
                    NekoWatch App encountered an unexpected error. Please try again.
                </LuffyError>

                {!!(error as Error)?.message && (
                    <pre className="max-h-48 overflow-auto rounded-xl bg-black/50 p-3 text-left text-xs text-red-200 whitespace-pre-wrap break-words">
                        {(error as Error).message}
                    </pre>
                )}

                <div className="flex items-center justify-center gap-3">
                    <Button
                        type="button"
                        intent="gray-outline"
                        className="rounded-full"
                        onClick={resetErrorBoundary}
                    >
                        Retry
                    </Button>
                    <Button
                        type="button"
                        intent="gray-outline"
                        className="rounded-full"
                        onClick={() => window.location.reload()}
                    >
                        Reload
                    </Button>
                </div>
            </div>
        </div>
    )
}

ReactDOM.createRoot(document.getElementById("root")!, {
    onUncaughtError: (error, errorInfo) => {
        console.error("[Root] Uncaught renderer error", error, errorInfo)
    },
    onCaughtError: (error, errorInfo) => {
        console.error("[Root] Caught renderer error", error, errorInfo)
    },
}).render(
    <ErrorBoundary FallbackComponent={RootErrorFallback}>
        <ClientProviders>
            <NekoWatchBranding />
            <DesktopStartupReady />
            <AppRouterProvider />
        </ClientProviders>
    </ErrorBoundary>,
)
