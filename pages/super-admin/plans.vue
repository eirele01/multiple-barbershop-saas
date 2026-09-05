<script setup lang="ts">
/**
 * Super Admin Plans — Tier Maker
 *
 * Create, edit, and delete subscription plans dynamically.
 * Each plan defines: price (monthly/yearly), resource limits, and
 * marketing features shown on the upgrade/pricing page.
 *
 * Convention: limits use -1 = unlimited.
 */
definePageMeta({
  layout: 'super-admin',
  middleware: 'super-admin',
})

const toast = useToast()

// ─── Data ──────────────────────────────────────────
const isLoading = ref(true)
const plans = ref<any[]>([])

const { formatPrice: formatShared } = useFormat()
function formatPrice(centavos: number): string {
  return formatShared(centavos / 100)
}

// ─── Fetch ─────────────────────────────────────────
async function fetchPlans() {
  isLoading.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const data = await $fetch('/api/super-admin/plans', {
      headers: { Authorization: `Bearer ${token}` },
    }) as any
    plans.value = data?.plans ?? []
  } catch (error) {
    console.error('Failed to fetch plans:', error)
    toast.error('Could not load plans. Please try again.')
  } finally {
    isLoading.value = false
  }
}

// ─── Modal state ───────────────────────────────────
const showModal = ref(false)
const editing = ref<any>(null) // null = create mode
const isSaving = ref(false)

interface LimitField { key: 'services' | 'gallery' | 'products' | 'staff'; label: string }

const limitFields: LimitField[] = [
  { key: 'services', label: 'Services' },
  { key: 'gallery', label: 'Gallery Images' },
  { key: 'products', label: 'Products' },
  { key: 'staff', label: 'Staff Members' },
]

const form = reactive({
  code: '',
  name: '',
  description: '',
  priceMonthly: 0, // pesos (converted to centavos on save)
  priceYearly: 0,  // pesos (converted to centavos on save)
  limits: { services: 10, gallery: 20, products: 10, staff: 5 } as Record<string, number>,
  features: [] as string[],
  is_active: true,
  is_default: false,
  sort_order: 0,
})

function openCreate() {
  editing.value = null
  form.code = ''
  form.name = ''
  form.description = ''
  form.priceMonthly = 0
  form.priceYearly = 0
  form.limits = { services: 10, gallery: 20, products: 10, staff: 5 }
  form.features = []
  form.is_active = true
  form.is_default = false
  form.sort_order = plans.value.length + 1
  showModal.value = true
}

function openEdit(plan: any) {
  editing.value = plan
  form.code = plan.code
  form.name = plan.name
  form.description = plan.description || ''
  form.priceMonthly = Math.round((plan.price_monthly || 0) / 100)
  form.priceYearly = Math.round((plan.price_yearly || 0) / 100)
  const l = plan.limits || {}
  form.limits = {
    services: typeof l.services === 'number' ? l.services : 10,
    gallery: typeof l.gallery === 'number' ? l.gallery : 20,
    products: typeof l.products === 'number' ? l.products : 10,
    staff: typeof l.staff === 'number' ? l.staff : 5,
  }
  form.features = Array.isArray(plan.features) ? [...plan.features] : []
  form.is_active = !!plan.is_active
  form.is_default = !!plan.is_default
  form.sort_order = plan.sort_order ?? 0
  showModal.value = true
}

function closeModal() {
  if (isSaving.value) return
  showModal.value = false
}

// ─── Form helpers ──────────────────────────────────
function isUnlimited(field: string): boolean {
  return form.limits[field] === -1
}
function toggleUnlimited(field: string) {
  if (form.limits[field] === -1) {
    form.limits[field] = 0
  } else {
    form.limits[field] = -1
  }
}

function addFeature() {
  form.features.push('')
}
function removeFeature(idx: number) {
  form.features.splice(idx, 1)
}
// ─── Save ──────────────────────────────────────────
async function savePlan() {
  // Validate
  if (!form.code.trim() || !/^[a-z0-9_]+$/.test(form.code.trim())) {
    toast.error('Code must be lowercase letters, numbers, and underscores only (e.g. "pro")')
    return
  }
  if (!form.name.trim()) {
    toast.error('Please enter a plan name')
    return
  }
  if (form.priceMonthly < 0 || form.priceYearly < 0) {
    toast.error('Prices cannot be negative')
    return
  }

  const payload = {
    code: form.code.trim().toLowerCase(),
    name: form.name.trim(),
    description: form.description.trim(),
    price_monthly: Math.round(form.priceMonthly * 100),
    price_yearly: Math.round(form.priceYearly * 100),
    limits: { ...form.limits },
    features: form.features.map(f => f.trim()).filter(Boolean),
    is_active: form.is_active,
    is_default: form.is_default,
    sort_order: Number(form.sort_order) || 0,
  }

  isSaving.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      toast.error('Please log in again')
      return
    }

    if (editing.value) {
      await $fetch(`/api/super-admin/plans/${editing.value.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      toast.success('Plan updated successfully')
    } else {
      await $fetch('/api/super-admin/plans', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      })
      toast.success('Plan created successfully')
    }

    showModal.value = false
    await fetchPlans()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to save plan'
    toast.error(msg)
  } finally {
    isSaving.value = false
  }
}

// ─── Delete ────────────────────────────────────────
async function deletePlan(plan: any) {
  if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return

  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      toast.error('Please log in again')
      return
    }

    await $fetch(`/api/super-admin/plans/${plan.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    toast.success('Plan deleted')
    await fetchPlans()
  } catch (error: any) {
    const msg = error?.data?.statusMessage || error?.message || 'Failed to delete plan'
    toast.error(msg)
  }
}

function limitLabel(val: number): string {
  if (val === -1) return '∞ Unlimited'
  return String(val)
}

onMounted(() => {
  fetchPlans()
})
</script>
<template>
  <div>
    <!-- Page Header -->
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="text-[var(--color-deep)]">Plan Tiers</h2>
        <p class="text-sm text-[var(--color-titanium)]">
          Define subscription plans, pricing, and resource limits — shown to shop owners on the upgrade page.
        </p>
      </div>
      <button
        class="btn-design flex items-center gap-1.5 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white"
        @click="openCreate"
      >
        <Icon name="lucide:plus" class="h-4 w-4" />
        New Plan
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="n in 3" :key="n" class="card-design p-5">
        <div class="h-5 w-32 animate-pulse rounded bg-[var(--color-silver)]/10" />
        <div class="mt-3 h-4 w-24 animate-pulse rounded bg-[var(--color-silver)]/10" />
        <div class="mt-4 h-4 w-full animate-pulse rounded bg-[var(--color-silver)]/10" />
        <div class="mt-2 h-4 w-3/4 animate-pulse rounded bg-[var(--color-silver)]/10" />
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="plans.length === 0" class="card-design p-10 text-center">
      <Icon name="lucide:layers" class="mx-auto h-10 w-10 text-[var(--color-silver)]" />
      <p class="mt-3 text-sm font-medium text-[var(--color-deep)]">No plans yet</p>
      <p class="mt-1 text-xs text-[var(--color-titanium)]">Create your first subscription plan to get started.</p>
      <button
        class="btn-design mt-4 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white"
        @click="openCreate"
      >
        Create Plan
      </button>
    </div>
    <!-- Plan cards grid -->
    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="plan in plans"
        :key="plan.id"
        class="card-design flex flex-col p-5"
        :class="plan.is_default ? 'border-[var(--color-info)]/40' : ''"
      >
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-[var(--color-deep)]">{{ plan.name }}</h3>
              <span
                v-if="plan.is_default"
                class="rounded-full bg-[var(--color-info)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-info)]"
              >
                Default
              </span>
            </div>
            <p class="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-titanium)]">
              {{ plan.code }}
            </p>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              :class="plan.is_active ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : 'bg-[var(--color-silver)]/20 text-[var(--color-titanium)]'"
            >
              {{ plan.is_active ? 'Active' : 'Inactive' }}
            </span>
            <span class="text-[10px] text-[var(--color-titanium)]">Order {{ plan.sort_order }}</span>
          </div>
        </div>

        <p v-if="plan.description" class="mt-3 text-xs leading-relaxed text-[var(--color-titanium)]">
          {{ plan.description }}
        </p>

        <div class="mt-4 grid grid-cols-2 gap-2 rounded-input bg-[var(--color-silver)]/5 p-3">
          <div>
            <p class="text-[10px] font-medium uppercase tracking-wide text-[var(--color-titanium)]">Monthly</p>
            <p class="text-sm font-bold text-[var(--color-deep)]">{{ formatPrice(plan.price_monthly) }}</p>
          </div>
          <div>
            <p class="text-[10px] font-medium uppercase tracking-wide text-[var(--color-titanium)]">Yearly</p>
            <p class="text-sm font-bold text-[var(--color-deep)]">{{ formatPrice(plan.price_yearly) }}</p>
          </div>
        </div>

        <div class="mt-4 space-y-2">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-titanium)]">Limits</p>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="lf in limitFields"
              :key="lf.key"
              class="rounded-full bg-[var(--color-silver)]/10 px-2.5 py-1 text-[11px] text-[var(--color-deep)]"
            >
              {{ lf.label }}: <span class="font-bold">{{ limitLabel(plan.limits?.[lf.key]) }}</span>
            </span>
          </div>
        </div>

        <div v-if="plan.features?.length" class="mt-4">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-titanium)]">
            Features ({{ plan.features.length }})
          </p>
          <ul class="mt-1.5 space-y-1">
            <li
              v-for="(feat, fi) in plan.features.slice(0, 4)"
              :key="fi"
              class="flex items-start gap-1.5 text-[11px] text-[var(--color-titanium)]"
            >
              <Icon name="lucide:check" class="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-success)]" />
              <span>{{ feat }}</span>
            </li>
            <li v-if="plan.features.length > 4" class="pl-4 text-[10px] text-[var(--color-titanium)]">
              +{{ plan.features.length - 4 }} more
            </li>
          </ul>
        </div>

        <div class="mt-auto flex gap-2 pt-4">
          <button
            class="flex-1 rounded-btn border border-[var(--color-silver)]/40 py-1.5 text-xs font-medium text-[var(--color-deep)] transition-colors hover:bg-[var(--color-silver)]/10"
            @click="openEdit(plan)"
          >
            <Icon name="lucide:pencil" class="mr-1 inline h-3.5 w-3.5" />
            Edit
          </button>
          <button
            class="rounded-btn border border-[var(--color-danger)]/30 px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
            @click="deletePlan(plan)"
          >
            <Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
    <!-- Create/Edit Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      @click.self="closeModal"
    >
      <div class="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-btn bg-[var(--color-pure-white)] p-6 shadow-xl">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-lg font-bold text-[var(--color-deep)]">
            {{ editing ? `Edit: ${editing.name}` : 'Create New Plan' }}
          </h3>
          <button class="text-[var(--color-titanium)] hover:text-[var(--color-deep)]" @click="closeModal">
            <Icon name="lucide:x" class="h-5 w-5" />
          </button>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Code *</label>
            <input
              v-model="form.code"
              type="text"
              placeholder="e.g. pro"
              class="input-design w-full rounded-btn border border-[var(--color-silver)]/40 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)]"
            />
            <p class="mt-1 text-[10px] text-[var(--color-titanium)]">Lowercase, letters/numbers/underscore. Used for shops.plan.</p>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Name *</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="e.g. Pro"
              class="input-design w-full rounded-btn border border-[var(--color-silver)]/40 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)]"
            />
          </div>
        </div>

        <div class="mt-4">
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Description</label>
          <textarea
            v-model="form.description"
            rows="2"
            placeholder="Short marketing description"
            class="input-design w-full resize-none rounded-btn border border-[var(--color-silver)]/40 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)]"
          />
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Monthly Price (₱, 0 = free)</label>
            <input
              v-model.number="form.priceMonthly"
              type="number"
              min="0"
              step="0.01"
              class="input-design w-full rounded-btn border border-[var(--color-silver)]/40 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)]"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Yearly Price (₱, 0 = free)</label>
            <input
              v-model.number="form.priceYearly"
              type="number"
              min="0"
              step="0.01"
              class="input-design w-full rounded-btn border border-[var(--color-silver)]/40 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)]"
            />
          </div>
        </div>
        <div class="mt-4">
          <label class="mb-2 block text-xs font-medium text-[var(--color-titanium)]">Resource Limits</label>
          <div class="space-y-2">
            <div
              v-for="lf in limitFields"
              :key="lf.key"
              class="flex items-center justify-between rounded-input border border-[var(--color-silver)]/30 px-3 py-2"
            >
              <span class="text-sm text-[var(--color-deep)]">{{ lf.label }}</span>
              <div class="flex items-center gap-2">
                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-titanium)]">
                  <input
                    type="checkbox"
                    :checked="isUnlimited(lf.key)"
                    @change="toggleUnlimited(lf.key)"
                    class="h-3.5 w-3.5 accent-[var(--color-info)]"
                  />
                  Unlimited
                </label>
                <input
                  v-model.number="form.limits[lf.key]"
                  type="number"
                  :min="0"
                  :disabled="isUnlimited(lf.key)"
                  class="w-20 rounded-btn border border-[var(--color-silver)]/40 bg-[var(--color-pure-white)] px-2 py-1 text-right text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)] disabled:opacity-40"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <div class="mb-1 flex items-center justify-between">
            <label class="text-xs font-medium text-[var(--color-titanium)]">Features (marketing list)</label>
            <button class="text-xs font-medium text-[var(--color-info)] hover:underline" @click="addFeature">
              + Add feature
            </button>
          </div>
          <div v-if="form.features.length" class="space-y-2">
            <div v-for="(feat, idx) in form.features" :key="idx" class="flex items-center gap-2">
              <input
                v-model="form.features[idx]"
                type="text"
                placeholder="e.g. Unlimited staff members"
                class="input-design w-full rounded-btn border border-[var(--color-silver)]/40 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)]"
              />
              <button class="text-[var(--color-titanium)] hover:text-[var(--color-danger)]" @click="removeFeature(idx)">
                <Icon name="lucide:trash-2" class="h-4 w-4" />
              </button>
            </div>
          </div>
          <p v-else class="text-[11px] text-[var(--color-titanium)]">No features yet. Add some to show on the pricing page.</p>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="flex cursor-pointer items-center justify-between rounded-input border border-[var(--color-silver)]/30 px-3 py-2 text-sm text-[var(--color-deep)]">
            Active
            <input v-model="form.is_active" type="checkbox" class="h-4 w-4 accent-[var(--color-success)]" />
          </label>
          <label class="flex cursor-pointer items-center justify-between rounded-input border border-[var(--color-silver)]/30 px-3 py-2 text-sm text-[var(--color-deep)]">
            Default plan
            <input v-model="form.is_default" type="checkbox" class="h-4 w-4 accent-[var(--color-info)]" />
          </label>
        </div>

        <div class="mt-4">
          <label class="mb-1 block text-xs font-medium text-[var(--color-titanium)]">Display Order</label>
          <input
            v-model.number="form.sort_order"
            type="number"
            min="0"
            class="input-design w-28 rounded-btn border border-[var(--color-silver)]/40 bg-[var(--color-pure-white)] px-3 py-2 text-sm text-[var(--color-deep)] outline-none focus:border-[var(--color-info)]"
          />
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            class="rounded-btn border border-[var(--color-silver)]/40 px-4 py-2 text-sm text-[var(--color-titanium)]"
            :disabled="isSaving"
            @click="closeModal"
          >
            Cancel
          </button>
          <button
            class="btn-design flex items-center gap-2 rounded-btn bg-[var(--color-deep)] px-4 py-2 text-sm font-medium text-white"
            :disabled="isSaving"
            @click="savePlan"
          >
            <Icon v-if="isSaving" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
            {{ editing ? 'Save Changes' : 'Create Plan' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
