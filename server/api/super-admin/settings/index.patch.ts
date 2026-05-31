/**
 * PATCH /api/super-admin/settings
 *
 * Update platform settings.
 * Upserts each provided setting into platform_settings.
 * Body: { platform_name?, platform_url?, support_email?,
 *         upgraded_monthly_price?, upgraded_yearly_price?,
 *         maintenance_mode?, maintenance_message? }
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { z } from 'zod'
import type { PlatformSettingsMap } from '~/types/database'

const settingsSchema = z.object({
  platform_name: z.string().optional(),
  platform_url: z.string().optional(),
  support_email: z.string().email().optional(),
  upgraded_monthly_price: z.string().optional(),
  upgraded_yearly_price: z.string().optional(),
  maintenance_mode: z.enum(['true', 'false']).optional(),
  maintenance_message: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const supabase = useSupabaseAdmin()

  // ── Auth: verify super_admin ──
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, statusMessage: 'Invalid token' })

  const { data: userProfile } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!userProfile || userProfile.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Super admin access required' })
  }

  // ── Validate body ──
  const body = await readBody(event)
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: parsed.error.flatten().fieldErrors,
    })
  }

  const updates = parsed.data

  // Check that at least one field is provided
  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No settings to update' })
  }

  try {
    // ── Upsert each provided setting ──
    const validKeys: Array<keyof PlatformSettingsMap> = [
      'platform_name',
      'platform_url',
      'support_email',
      'upgraded_monthly_price',
      'upgraded_yearly_price',
      'maintenance_mode',
      'maintenance_message',
    ]

    for (const [key, value] of Object.entries(updates)) {
      if (validKeys.includes(key as keyof PlatformSettingsMap) && value !== undefined) {
        const { error: upsertError } = await supabase
          .from('platform_settings')
          .upsert(
            { key, value: String(value) },
            { onConflict: 'key' }
          )

        if (upsertError) {
          console.error(`[SUPER-ADMIN SETTINGS] Upsert error for ${key}:`, upsertError)
          throw createError({ statusCode: 500, statusMessage: `Failed to update setting: ${key}` })
        }
      }
    }

    // ── Log to activity_logs ──
    await supabase.from('activity_logs').insert({
      shop_id: null,
      user_id: user.id,
      user_email: user.email,
      user_role: 'super_admin',
      action: 'platform.settings_updated',
      entity_type: 'platform_settings',
      entity_name: 'Platform Settings',
      new_value: updates,
    })

    return { success: true }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN SETTINGS] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update settings' })
  }
})
