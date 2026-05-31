/**
 * GET /api/super-admin/settings
 *
 * Get all platform settings.
 * Converts from array of {key, value} to a single object.
 */
import { useSupabaseAdmin } from '~/server/utils/supabase'
import type { PlatformSettings, PlatformSettingsMap } from '~/types/database'

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

  try {
    // ── Fetch all platform settings ──
    const { data: settings, error: settingsError } = await supabase
      .from('platform_settings')
      .select('*')

    if (settingsError) {
      console.error('[SUPER-ADMIN SETTINGS] Fetch error:', settingsError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch settings' })
    }

    // ── Convert array to map object ──
    const defaultSettings: PlatformSettingsMap = {
      platform_name: 'BarberShop SaaS',
      platform_url: 'https://yourdomain.com',
      support_email: 'support@yourdomain.com',
      upgraded_monthly_price: '499',
      upgraded_yearly_price: '4990',
      maintenance_mode: 'false',
      maintenance_message: 'We are performing scheduled maintenance. We will be back shortly.',
    }

    const settingsMap = { ...defaultSettings }

    if (settings) {
      for (const setting of settings as PlatformSettings[]) {
        if (setting.key in defaultSettings && setting.value !== null) {
          (settingsMap as Record<string, string>)[setting.key] = setting.value
        }
      }
    }

    return { settings: settingsMap }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('[SUPER-ADMIN SETTINGS] Error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load settings' })
  }
})
