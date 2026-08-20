/**
 * useRealtimeSubscription — Supabase Realtime channel lifecycle manager
 *
 * Eliminates duplicated setup/teardown patterns for Supabase Realtime
 * subscriptions across components and pages.
 *
 * Usage:
 *   useRealtimeSubscription(
 *     () => authStore.shopId,                        // shopId getter (for channel name + filter)
 *     { table: 'payment_verifications', event: '*' }, // subscription config
 *     () => fetchPendingCount()                       // callback on change
 *   )
 *
 * Automatically cleans up on component unmount.
 *
 * Safe to call `setup()` manually (e.g. from a `watch`) in addition to the
 * automatic `onMounted` — repeated calls for the same shopId are a no-op,
 * and channel teardown is awaited before a new channel is created.
 */

export function useRealtimeSubscription(
  getShopId: () => string | null,
  config: { table: string; event: 'INSERT' | 'UPDATE' | 'DELETE' | '*' },
  onPayload: (payload: any) => void
) {
  let channel: ReturnType<ReturnType<typeof useSupabase>['channel']> | null = null
  let currentShopId: string | null = null

  async function setup() {
    const shopId = getShopId()
    if (!shopId) return

    // No-op if already subscribed for this shop — prevents duplicate
    // setup calls (e.g. onMounted + a manual call) from racing each other.
    if (shopId === currentShopId && channel) return

    const supabase = useSupabase()
    const channelName = `realtime-${config.table}-${shopId}`

    // Clean up existing channel with same name and WAIT for it to finish
    // before creating a new one, otherwise Realtime can reject .on() calls
    // on the new channel while the old one is still tearing down.
    const existing = supabase.getChannels().find((c) => c.topic === channelName)
    if (existing) {
      await supabase.removeChannel(existing)
    }

    currentShopId = shopId

    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: config.event,
          schema: 'public',
          table: config.table,
          filter: `shop_id=eq.${shopId}`,
        },
        onPayload
      )
      .subscribe()
  }

  async function teardown() {
    if (channel) {
      const supabase = useSupabase()
      await supabase.removeChannel(channel)
      channel = null
      currentShopId = null
    }
  }

  if (import.meta.client) {
    onMounted(setup)
    onUnmounted(teardown)
  }

  return { setup, teardown }
}