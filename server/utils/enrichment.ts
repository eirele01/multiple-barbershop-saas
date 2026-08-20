/**
 * Server-side data enrichment helpers.
 *
 * Centralizes the batched customer/barber name lookup patterns
 * that were duplicated across 10+ server endpoints.
 */
import { createClient } from '@supabase/supabase-js'

/** Enrichment helper factory — creates batch lookup functions for a given Supabase client */
export function createEnrichmentHelpers(supabase: ReturnType<typeof createClient>) {
  /**
   * Batch-fetch customer display names and phone numbers by user IDs.
   * Returns a Map<userId, { display_name, phone_number }>.
   */
  async function enrichCustomers(ids: string[]): Promise<Map<string, { display_name: string; phone_number: string | null }>> {
    if (ids.length === 0) return new Map()
    const { data } = await supabase
      .from('users')
      .select('id, display_name, phone_number')
      .in('id', ids)
    return new Map((data || []).map((u: any) => [u.id, { display_name: u.display_name, phone_number: u.phone_number }]))
  }

  /**
   * Batch-fetch barber display names by barber IDs.
   * Two-hop: barbers.id → barbers.user_id → users.display_name
   * Returns a Map<barberId, displayName>.
   */
  async function enrichBarbers(barberIds: string[]): Promise<Map<string, string>> {
    if (barberIds.length === 0) return new Map()
    const { data: barbers } = await supabase
      .from('barbers')
      .select('id, user_id')
      .in('id', barberIds)
    if (!barbers || barbers.length === 0) return new Map()

    const userIds = [...new Set(barbers.map((b: any) => b.user_id).filter(Boolean))]
    if (userIds.length === 0) return new Map()

    const { data: users } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', userIds)

    const barberMap = new Map<string, string>()
    for (const barber of barbers) {
      const user = users?.find((u: any) => u.id === barber.user_id)
      barberMap.set(barber.id, user?.display_name || 'Barber')
    }
    return barberMap
  }

  /**
   * Batch-fetch shop names by shop IDs.
   * Returns a Map<shopId, name>.
   */
  async function enrichShops(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const { data } = await supabase
      .from('shops')
      .select('id, name')
      .in('id', ids)
    return new Map((data || []).map((s: any) => [s.id, s.name]))
  }

  /**
   * Batch-fetch payment method names by method IDs.
   * Returns a Map<methodId, name>.
   */
  async function enrichPaymentMethods(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const { data } = await supabase
      .from('payment_methods')
      .select('id, name')
      .in('id', ids)
    return new Map((data || []).map((m: any) => [m.id, m.name]))
  }

  return { enrichCustomers, enrichBarbers, enrichShops, enrichPaymentMethods }
}
