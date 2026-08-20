/**
 * useBreadcrumbs — Shared breadcrumb computation for layout headers
 *
 * Eliminates duplicated breadcrumb logic between admin.vue and super-admin.vue layouts.
 *
 * Usage:
 *   const breadcrumbs = useBreadcrumbs({
 *     home: { label: 'Admin', to: '/admin/dashboard' },
 *     pathMap: { bookings: 'Bookings', staff: 'Staff', settings: 'Settings' },
 *   })
 */

interface BreadcrumbConfig {
  home: { label: string; to: string }
  pathMap: Record<string, string>
}

/**
 * Compute breadcrumbs from the current route path.
 * Supports nested paths: /admin/bookings/123 → Admin > Bookings > Details
 */
export function useBreadcrumbs(config: BreadcrumbConfig) {
  const route = useRoute()

  const breadcrumbs = computed(() => {
    const crumbs: { label: string; to?: string }[] = [config.home]
    const segments = route.path.split('/').filter(Boolean)

    // Skip the first segment (admin/super-admin) since it's covered by home
    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i]
      const partialPath = '/' + segments.slice(0, i + 1).join('/')

      // Check exact match first
      if (config.pathMap[partialPath]) {
        crumbs.push({
          label: config.pathMap[partialPath],
          to: i < segments.length - 1 ? partialPath : undefined,
        })
      } else {
        // Unknown segment — use 'Details' for the deepest level
        crumbs.push({
          label: i < segments.length - 1 ? segment : 'Details',
          to: i < segments.length - 1 ? partialPath : undefined,
        })
      }
    }

    return crumbs
  })

  return breadcrumbs
}
