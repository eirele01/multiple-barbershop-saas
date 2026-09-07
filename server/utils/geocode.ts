/**
 * Geocode an address using OpenStreetMap's Nominatim service (free, no API key).
 *
 * Usage policy: max 1 request/second, must set a descriptive User-Agent.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export async function geocodeAddress(address: {
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
}): Promise<{ latitude: number; longitude: number } | null> {
  const parts = [address.street, address.city, address.state, address.zip, address.country]
    .filter(Boolean)
    .join(', ')

  if (!parts) return null

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(parts)}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ReservationPH/1.0 (https://reservationph.com)',
    },
  })

  if (!response.ok) return null

  const results = await response.json() as Array<{ lat: string; lon: string }>
  if (!results.length) return null

  return {
    latitude: parseFloat(results[0].lat),
    longitude: parseFloat(results[0].lon),
  }
}