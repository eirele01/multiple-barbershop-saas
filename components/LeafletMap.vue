<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { Map as LeafletMap, Marker } from 'leaflet'

const props = defineProps<{
  latitude: number
  longitude: number
  shopName: string
  brandColor?: string
}>()

const mapContainer = ref<HTMLElement | null>(null)
let map: LeafletMap | null = null
let marker: Marker | null = null

onMounted(async () => {
  // Leaflet touches `window`, so it must be imported client-side only
  const L = await import('leaflet')

  if (!mapContainer.value) return

  map = L.map(mapContainer.value, {
    center: [props.latitude, props.longitude],
    zoom: 15,
    scrollWheelZoom: false, // prevents page-scroll hijack; click to enable
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

  // Custom marker matching brand color
  const icon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="background:${props.brandColor || '#C9A96E'};width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })

  marker = L.marker([props.latitude, props.longitude], { icon }).addTo(map)
  marker.bindPopup(`<strong>${props.shopName}</strong>`)

  // Re-enable scroll zoom on click (nice UX for embedded maps)
  map.on('click', () => map?.scrollWheelZoom.enable())
})

onUnmounted(() => {
  map?.remove()
  map = null
})

// Update map if coordinates change (e.g. shop data refetch)
watch(() => [props.latitude, props.longitude], ([lat, lon]) => {
  if (map && marker) {
    map.setView([lat, lon], 15)
    marker.setLatLng([lat, lon])
  }
})
</script>

<template>
  <div ref="mapContainer" class="h-full w-full min-h-[300px]" />
</template>

<style>
/* Leaflet's own CSS — required, import once globally (see step 3) */
@import 'leaflet/dist/leaflet.css';
</style>