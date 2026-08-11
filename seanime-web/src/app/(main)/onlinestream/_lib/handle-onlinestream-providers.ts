import { ExtensionRepo_OnlinestreamProviderExtensionItem } from "@/api/generated/types"
import { useListOnlinestreamProviderExtensions } from "@/api/hooks/extensions.hooks"
import {
    __onlinestream_selectedProviderAtom,
    NEKOWATCH_ONLINESTREAM_PROVIDER_ID,
} from "@/app/(main)/onlinestream/_lib/onlinestream.atoms"
import { logger } from "@/lib/helpers/debug"
import { useAtom } from "jotai/react"
import React from "react"

const NEKOWATCH_FALLBACK_PROVIDER: ExtensionRepo_OnlinestreamProviderExtensionItem = {
    id: NEKOWATCH_ONLINESTREAM_PROVIDER_ID,
    name: "NekoWatch",
    lang: "multi",
    episodeServers: ["default"],
    supportsDub: true,
}

export function useHandleOnlinestreamProviderExtensions() {

    const { data: providerExtensions } = useListOnlinestreamProviderExtensions()

    const [provider, setProvider] = useAtom(__onlinestream_selectedProviderAtom)

    // NekoWatch is part of the desktop app, not an optional marketplace provider.
    // Extension loading happens asynchronously upstream, so the list endpoint can
    // briefly return [] during startup. Keep the native provider available during
    // that window rather than putting Watch into a permanent "no providers" state.
    const resolvedProviderExtensions = React.useMemo(() => {
        const extensions = providerExtensions ?? []
        const nekowatch = extensions.find(p => p.id === NEKOWATCH_ONLINESTREAM_PROVIDER_ID) ?? NEKOWATCH_FALLBACK_PROVIDER
        const others = extensions
            .filter(p => p.id !== NEKOWATCH_ONLINESTREAM_PROVIDER_ID)
            .sort((a, b) => a.name.localeCompare(b.name))

        return [nekowatch, ...others]
    }, [providerExtensions])

    /**
     * Override a missing/stale provider with the built-in NekoWatch provider.
     */
    React.useLayoutEffect(() => {
        logger("ONLINESTREAM").info("extensions", resolvedProviderExtensions)

        if (provider === null || !resolvedProviderExtensions.find(p => p.id === provider)) {
            setProvider(NEKOWATCH_ONLINESTREAM_PROVIDER_ID)
        }
    }, [provider, resolvedProviderExtensions, setProvider])

    return {
        providerExtensions: resolvedProviderExtensions,
        providerExtensionOptions: resolvedProviderExtensions.map(provider => ({
            label: provider.name,
            value: provider.id,
        })),
    }

}
