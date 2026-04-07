const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const TIMEOUT_MS = 10000

/**
 * Fetch wrapper with timeout and graceful error handling.
 * Returns { data, error } — never throws.
 */
async function apiFetch(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })

    clearTimeout(timer)

    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const data = await response.json()
    return { data, error: null }
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      return { data: null, error: 'Tempo limite excedido. Tente novamente.' }
    }
    return { data: null, error: 'Servidor temporariamente offline.' }
  }
}

/**
 * GET /api/status
 * Returns array of all cages:
 * { cage_id, animal_name, status, activity_level, animal_count, zone, zone_label,
 *   last_update, location_x, location_y }
 */
export async function fetchStatus() {
  return apiFetch('/api/status')
}

/**
 * GET /api/cage/{id}/history
 * Returns array by hour: { hour, active_ratio }
 */
export async function fetchCageHistory(cageId) {
  return apiFetch(`/api/cage/${cageId}/history`)
}

/**
 * GET /api/cage/{id}/snapshot
 * Returns { cage_id, image_base64, timestamp }
 */
export async function fetchCageSnapshot(cageId) {
  return apiFetch(`/api/cage/${cageId}/snapshot`)
}

/**
 * POST /api/chat
 * Body: { message }
 * Returns { response }
 */
export async function sendChatMessage(message) {
  return apiFetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

/**
 * GET /api/route/suggest
 * Returns ordered array: { cage_id, animal_name, expected_activity, status }
 */
export async function fetchRoute() {
  return apiFetch('/api/route/suggest')
}
