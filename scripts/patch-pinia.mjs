/**
 * Patch Pinia's shouldHydrate to use Object.prototype.hasOwnProperty.call()
 * instead of obj.hasOwnProperty() — which fails on null-prototype objects
 * returned by Supabase queries.
 *
 * This script runs as part of the postinstall hook.
 * See: https://github.com/vuejs/pinia/issues/2807
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const filesToPatch = [
  join('node_modules', 'pinia', 'dist', 'pinia.mjs'),
  join('node_modules', 'pinia', 'dist', 'pinia.cjs'),
]

const oldPattern = /!obj\.hasOwnProperty\(skipHydrateSymbol\)/g
const newPattern = '!Object.prototype.hasOwnProperty.call(obj, skipHydrateSymbol)'

for (const file of filesToPatch) {
  try {
    const content = readFileSync(file, 'utf8')
    if (content.includes('Object.prototype.hasOwnProperty.call(obj, skipHydrateSymbol)')) {
      console.log(`[patch-pinia] Already patched: ${file}`)
      continue
    }
    if (!oldPattern.test(content)) {
      console.log(`[patch-pinia] Pattern not found (may be fixed upstream): ${file}`)
      continue
    }
    const patched = content.replace(oldPattern, newPattern)
    writeFileSync(file, patched, 'utf8')
    console.log(`[patch-pinia] Patched: ${file}`)
  } catch (err) {
    console.warn(`[patch-pinia] Skipped: ${file} (${err.message})`)
  }
}

console.log('[patch-pinia] Done')
