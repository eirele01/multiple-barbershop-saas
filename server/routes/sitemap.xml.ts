/**
 * Dynamic XML sitemap
 * Includes homepage + all active shop pages
 */
export default defineEventHandler(async (event) => {
  const supabase = useSupabaseAdmin()
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl || 'https://yourdomain.com'

  // Fetch all active shops
  const { data: shops } = await supabase
    .from('shops')
    .select('slug, updated_at')
    .eq('is_active', true)

  const today = new Date().toISOString().split('T')[0]

  const urls = [
    // Homepage
    `  <url>
    <loc>${siteUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
    // Shop pages
    ...(shops || []).map((shop: any) => `  <url>
    <loc>${siteUrl}/shop/${shop.slug}</loc>
    <lastmod>${shop.updated_at ? new Date(shop.updated_at).toISOString().split('T')[0] : today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  event.node.res.setHeader('Content-Type', 'application/xml')
  return xml
})
