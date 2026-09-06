// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: process.env.NODE_ENV === 'development' },

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
    // Auth pages — no SSR to prevent session/data leakage during server render
    '/login': { noSSR: true },
    '/register': { noSSR: true },
    '/customer/login': { noSSR: true },
    '/customer/register': { noSSR: true },
    '/auth/verify-email': { noSSR: true },
    // Heavy admin routes — no SSR (data loaded client-side, reduces server load)
    '/admin/billing': { noSSR: true },
    // Legacy upgrade page — moved to the billing hub
    '/admin/upgrade': { redirect: '/admin/billing' },
    '/admin/loyalty/members': { noSSR: true },
    '/admin/loyalty/rewards': { noSSR: true },
    '/admin/loyalty/transactions': { noSSR: true },
    '/admin/staff': { noSSR: true },
    '/admin/bookings/**': { noSSR: true },
    '/admin/payments/verification': { noSSR: true },
    '/admin/calendar': { noSSR: true },
    '/admin/reports': { noSSR: true },
    // Super-admin heavy routes — no SSR
    '/super-admin/analytics': { noSSR: true },
    '/super-admin/subscriptions': { noSSR: true },
    '/super-admin/shops/**': { noSSR: true },
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
      title: 'Reservation PH — Online Booking for Any Business',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Online booking and reservation management for any business — appointments, staff scheduling, payments, and loyalty.' },
      ],
      link: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
        },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      ],
      script: [
        {
          innerHTML: 'addEventListener("error",function(e){if(e.message&&e.message.includes("startTime")&&e.message.includes("reportAllChanges")){e.stopImmediatePropagation();e.preventDefault();}},true);',
        },
      ],
    },
  },

  runtimeConfig: {
    // Server-only (never exposed to client)
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
    resendApiKey: process.env.RESEND_API_KEY || '',
    resendSenderEmail: process.env.RESEND_SENDER_EMAIL || '',
    nuxtEncryptionKey: process.env.NUXT_ENCRYPTION_KEY || '',
    // Platform-level PayMongo keys — used for SaaS plan upgrades (money goes to the platform)
    paymongoSecretKey: process.env.PAYMONGO_SECRET_KEY || '',
    paymongoWebhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || '',

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