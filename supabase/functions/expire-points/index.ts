/**
 * Supabase Edge Function: expire-points
 *
 * Scheduled cron job that expires loyalty points past their expiry date.
 * Runs daily at midnight Manila time (16:00 UTC).
 * Cron schedule: "0 16 * * *"
 *
 * Logic:
 * 1. Find all 'earned' or 'welcome_bonus' loyalty_points records where:
 *    - expires_at < NOW()
 *    - Not already expired (no matching 'expired' entry referencing this record)
 * 2. For each expiring record:
 *    a. Get the customer's current balance
 *    b. Insert an 'expired' ledger entry deducting the points
 * 3. Log results
 *
 * Deployment:
 *   supabase functions deploy expire-points
 *   supabase cron create --name expire-points --schedule "0 16 * * *" --fn-name expire-points
 *
 * Environment variables needed:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const now = new Date().toISOString()
    let expiredCount = 0
    let errorCount = 0

    // Step 1: Find all expiring records
    const { data: expiringRecords, error: fetchError } = await supabase
      .from('loyalty_points')
      .select('id, shop_id, customer_id, points, type, expires_at')
      .in('type', ['earned', 'welcome_bonus'])
      .lt('expires_at', now)
      .not('expires_at', 'is', null)

    if (fetchError) {
      console.error('[EXPIRE-POINTS] Error fetching expiring records:', fetchError)
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!expiringRecords || expiringRecords.length === 0) {
      return new Response(
        JSON.stringify({ success: true, expiredCount: 0, message: 'No points to expire' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: For each expiring record, check if already expired and process
    for (const record of expiringRecords) {
      try {
        // Check if this record already has a corresponding 'expired' entry
        const { data: existingExpired } = await supabase
          .from('loyalty_points')
          .select('id')
          .eq('shop_id', record.shop_id)
          .eq('customer_id', record.customer_id)
          .eq('type', 'expired')
          .eq('note', `Expired: record ${record.id}`)
          .limit(1)

        if (existingExpired && existingExpired.length > 0) {
          // Already expired — skip
          continue
        }

        // Get current balance
        const { data: latestBalance } = await supabase
          .from('loyalty_points')
          .select('balance_after')
          .eq('shop_id', record.shop_id)
          .eq('customer_id', record.customer_id)
          .order('created_at', { ascending: false })
          .limit(1)

        const currentBalance = latestBalance?.[0]?.balance_after || 0
        const balanceAfter = Math.max(0, currentBalance - record.points)

        // Insert expired entry
        const { error: insertError } = await supabase
          .from('loyalty_points')
          .insert({
            shop_id: record.shop_id,
            customer_id: record.customer_id,
            booking_id: null,
            reward_id: null,
            type: 'expired',
            points: record.points,
            balance_after: balanceAfter,
            note: `Expired: record ${record.id}`,
            expires_at: null,
          })

        if (insertError) {
          console.error(`[EXPIRE-POINTS] Error expiring record ${record.id}:`, insertError)
          errorCount++
          continue
        }

        expiredCount++
      } catch (recordError) {
        console.error(`[EXPIRE-POINTS] Error processing record ${record.id}:`, recordError)
        errorCount++
      }
    }

    console.log(`[EXPIRE-POINTS] Processed ${expiringRecords.length} records. Expired: ${expiredCount}, Errors: ${errorCount}`)

    return new Response(
      JSON.stringify({
        success: true,
        totalChecked: expiringRecords.length,
        expiredCount,
        errorCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[EXPIRE-POINTS] Fatal error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
