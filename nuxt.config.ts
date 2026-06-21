// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  experimental: {
    payloadExtraction: true,
  },

  routeRules: {
    // Public pages — SWR with 60s stale-while-revalidate
    '/shop/**': { swr: 60 },
    // Shop landing page API — cache for 30s since shop data changes infrequently
    '/api/shops/[slug]': { swr: 30 },
    // Shop listing — cache for 60s
    '/api/shops': { swr: 60 },
    // Availability must always be fresh
    '/api/shops/*/availability': { cache: false },
    // Admin/super-admin — never cache authenticated data
    '/api/admin/**': { cache: false },
    '/api/super-admin/**': { cache: false },
    // Customer API — no cache (authenticated)
    '/api/customer/**': { cache: false },
    // Bookings — no cache (fresh data required)
    '/api/bookings/**': { cache: false },
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    'shadcn-nuxt',
    '@nuxtjs/color-mode',
  ],

  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },

  colorMode: {
    preference: 'light',
    fallback: 'light',
  },

  tailwindcss: {
    cssPath: '~/assets/css/tailwind.css',
    configPath: 'tailwind.config.ts',
  },

  app: {
    head: {
      title: 'Barbershop SaaS',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Multi-Tenant SaaS Barbershop Management System' },
      ],
      link: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
        },
      ],
    },
  },

  runtimeConfig: {
    // Server-only (never exposed to client)
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    nuxtEncryptionKey: process.env.NUXT_ENCRYPTION_KEY || '',

    // Public (exposed to client)
    public: {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_KEY || '',
      googleMapsApiKey: process.env.NUXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
    },
  },

  typescript: {
    strict: true,
    shim: false,
  },
})