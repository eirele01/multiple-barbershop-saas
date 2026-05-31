<script setup lang="ts">
/**
 * GalleryLightbox — Full-screen image lightbox component
 * Touch-friendly for mobile with swipe navigation.
 *
 * Props:
 * - images: Array of image objects { url, caption? }
 * - initialIndex: Starting image index
 * - modelValue: Whether the lightbox is open
 *
 * Emits:
 * - update:modelValue: Toggle lightbox open/close
 */

interface GalleryImage {
  url: string
  caption?: string | null
  thumbnail_url?: string | null
}

const props = defineProps<{
  images: GalleryImage[]
  initialIndex?: number
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const currentIndex = ref(props.initialIndex || 0)
const isAnimating = ref(false)
const touchStartX = ref(0)
const touchEndX = ref(0)

// Watch for external open/close
watch(() => props.modelValue, (val) => {
  if (val) {
    currentIndex.value = props.initialIndex || 0
    // Prevent body scroll when lightbox is open
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

const currentImage = computed(() => props.images[currentIndex.value])

function close() {
  isAnimating.value = true
  setTimeout(() => {
    emit('update:modelValue', false)
    isAnimating.value = false
  }, 150)
}

function next() {
  if (currentIndex.value < props.images.length - 1) {
    currentIndex.value++
  }
}

function prev() {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return
  if (e.key === 'Escape') close()
  if (e.key === 'ArrowRight') next()
  if (e.key === 'ArrowLeft') prev()
}

// Touch events for swipe
function handleTouchStart(e: TouchEvent) {
  touchStartX.value = e.changedTouches[0].screenX
}

function handleTouchEnd(e: TouchEvent) {
  touchEndX.value = e.changedTouches[0].screenX
  const diff = touchStartX.value - touchEndX.value
  if (Math.abs(diff) > 50) {
    if (diff > 0) next()
    else prev()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
        @touchstart="handleTouchStart"
        @touchend="handleTouchEnd"
      >
        <!-- Close Button -->
        <button
          class="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          @click="close"
        >
          <Icon name="lucide:x" class="h-6 w-6" />
        </button>

        <!-- Image Counter -->
        <div class="absolute top-4 left-4 z-10 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>

        <!-- Previous Button -->
        <button
          v-if="currentIndex > 0"
          class="absolute left-2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-4"
          @click="prev"
        >
          <Icon name="lucide:chevron-left" class="h-8 w-8" />
        </button>

        <!-- Image -->
        <div class="flex h-full w-full items-center justify-center px-12 sm:px-16">
          <img
            :src="currentImage?.url"
            :alt="currentImage?.caption || 'Gallery image'"
            loading="lazy"
            class="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
        </div>

        <!-- Next Button -->
        <button
          v-if="currentIndex < images.length - 1"
          class="absolute right-2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4"
          @click="next"
        >
          <Icon name="lucide:chevron-right" class="h-8 w-8" />
        </button>

        <!-- Caption -->
        <div
          v-if="currentImage?.caption"
          class="absolute bottom-6 left-0 right-0 z-10 text-center"
        >
          <p class="mx-auto max-w-lg rounded-lg bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-sm">
            {{ currentImage.caption }}
          </p>
        </div>

        <!-- Thumbnail strip (desktop only) -->
        <div
          v-if="images.length > 1"
          class="absolute bottom-16 left-0 right-0 z-10 hidden justify-center gap-2 overflow-x-auto px-4 md:flex"
        >
          <button
            v-for="(img, idx) in images"
            :key="idx"
            class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border-2 transition-all"
            :class="idx === currentIndex ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-75'"
            @click="currentIndex = idx"
          >
            <img
              :src="img.thumbnail_url || img.url"
              :alt="img.caption || `Image ${idx + 1}`"
              loading="lazy"
              class="h-full w-full object-cover"
            />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
