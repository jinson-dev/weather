<script setup lang="ts">
import { ref, computed, watchEffect, onMounted, onBeforeUnmount, watch } from 'vue'
// Open-Meteo WMO weather code mappings
const WMO_CODES: Record<number, { label: string; icon: string; bg: string }> = {
  0:  { label: 'Clear Sky',        icon: 'sun',          bg: 'clear-day'    },
  1:  { label: 'Mainly Clear',     icon: 'sun',          bg: 'clear-day'    },
  2:  { label: 'Partly Cloudy',    icon: 'cloud-sun',    bg: 'cloudy'       },
  3:  { label: 'Overcast',         icon: 'cloud',        bg: 'cloudy'       },
  45: { label: 'Foggy',            icon: 'cloud-fog',    bg: 'foggy'        },
  48: { label: 'Icy Fog',          icon: 'cloud-fog',    bg: 'foggy'        },
  51: { label: 'Light Drizzle',    icon: 'cloud-drizzle',bg: 'rainy'        },
  53: { label: 'Drizzle',          icon: 'cloud-drizzle',bg: 'rainy'        },
  55: { label: 'Heavy Drizzle',    icon: 'cloud-drizzle',bg: 'rainy'        },
  61: { label: 'Light Rain',       icon: 'cloud-rain',   bg: 'rainy'        },
  63: { label: 'Rain',             icon: 'cloud-rain',   bg: 'rainy'        },
  65: { label: 'Heavy Rain',       icon: 'cloud-rain',   bg: 'rainy'        },
  71: { label: 'Light Snow',       icon: 'cloud-snow',   bg: 'snowy'        },
  73: { label: 'Snow',             icon: 'cloud-snow',   bg: 'snowy'        },
  75: { label: 'Heavy Snow',       icon: 'cloud-snow',   bg: 'snowy'        },
  80: { label: 'Showers',          icon: 'cloud-rain',   bg: 'rainy'        },
  95: { label: 'Thunderstorm',     icon: 'cloud-lightning', bg: 'thunderstorm' },
  99: { label: 'Heavy Thunderstorm', icon: 'cloud-lightning', bg: 'thunderstorm' },
}

interface WeatherResult {
  latitude?: number
  longitude?: number
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    dew_point_2m?: number
    wind_speed_10m: number
    wind_direction_10m?: number
    wind_gusts_10m?: number
    precipitation: number
    precipitation_probability?: number
    weather_code: number
    is_day: number
    uv_index?: number
    cloud_cover?: number
    surface_pressure?: number
    visibility?: number
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    apparent_temperature: number[]
    weather_code: number[]
    precipitation_probability: number[]
    wind_speed_10m: number[]
    visibility: number[]
    cloud_cover: number[]
  }
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    weather_code: number[]
    precipitation_sum: number[]
    precipitation_hours: number[]
    precipitation_probability_max: number[]
    wind_speed_10m_max: number[]
    uv_index_max: number[]
    sunrise: string[]
    sunset: string[]
  }
  location: { name: string; country: string; timezone?: string }
}

interface AstronomyResult {
  moonrise: string
  moonset: string
  moon_phase?: string
  moon_illumination?: string
}

interface ResolvedLocation {
  name: string
  country: string
}

const searchQuery = ref('')
const weatherData = ref<WeatherResult | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const now = ref(new Date())
const astronomyData = ref<AstronomyResult | null>(null)
const isClientMounted = ref(false)
let clockTimer: ReturnType<typeof setInterval> | null = null

// Autocomplete
interface GeoSuggestion {
  id: number
  name: string
  admin1?: string   // state / province
  admin2?: string   // district / county
  country: string
  country_code: string
  latitude: number
  longitude: number
}
const suggestions = ref<GeoSuggestion[]>([])
const showSuggestions = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function fetchSuggestions(q: string) {
  if (!q.trim() || q.length < 2) { suggestions.value = []; return }
  try {
    const res: any = await $fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
    )
    suggestions.value = res.results ?? []
  } catch { suggestions.value = [] }
}

function onSearchInput() {
  showSuggestions.value = true
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchSuggestions(searchQuery.value), 320)
}

async function selectSuggestion(s: GeoSuggestion) {
  showSuggestions.value = false
  suggestions.value = []
  searchQuery.value = ''
  await fetchByCoords(s.latitude, s.longitude, s.name)
  if (weatherData.value) {
    weatherData.value.location = { name: s.name, country: s.country_code }
  }
}

function formatSuggestion(s: GeoSuggestion): string {
  const parts = [s.admin2, s.admin1, s.country].filter(Boolean)
  return parts.join(', ')
}

const condition = computed(() => {
  if (!weatherData.value) return WMO_CODES[0]
  const code = weatherData.value.current.weather_code
  const base = WMO_CODES[code] || WMO_CODES[0]
  const isNight = weatherData.value.current.is_day === 0
  if (isNight && (code === 0 || code === 1)) {
    return { ...base, bg: 'clear-night', icon: 'moon' }
  }
  return base
})

// Gradient map — richer palettes so no condition ever looks dull
const BG_GRADIENTS: Record<string, string> = {
  'clear-day':    'linear-gradient(160deg, #1d4ed8 0%, #0ea5e9 50%, #06b6d4 100%)',
  'clear-night':  'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
  'cloudy':       'linear-gradient(160deg, #1e3a5f 0%, #2d6a8f 45%, #4a90b8 100%)',
  'rainy':        'linear-gradient(160deg, #1a2535 0%, #243447 45%, #2e4a6b 100%)',
  'snowy':        'linear-gradient(160deg, #4b8fd4 0%, #93c5fd 50%, #dbeafe 100%)',
  'foggy':        'linear-gradient(160deg, #2a4a6b 0%, #5b7fa6 50%, #8fb3cc 100%)',
  'thunderstorm': 'linear-gradient(160deg, #1e1b4b 0%, #4c1d95 50%, #7c3aed 100%)',
}


const bgStyle = computed(() => ({
  background: BG_GRADIENTS[condition.value?.bg || 'clear-day'] ?? BG_GRADIENTS['clear-day'],
}))

// Sync body background so the full viewport matches — fixes grey bleed-through
onMounted(() => {
  watchEffect(() => {
    if (import.meta.client) {
      document.body.style.background = BG_GRADIENTS[condition.value?.bg || 'clear-day'] ?? BG_GRADIENTS['clear-day']
      document.body.style.transition = 'background 1.4s ease'
    }
  })
})


const currentHourIndex = computed(() => {
  if (!weatherData.value) return 0
  // Open-Meteo returns local times (timezone=auto). toISOString() is UTC — use local formatting instead.
  const now = new Date()
  const localHour = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`
  const idx = weatherData.value.hourly.time.findIndex(t => t.startsWith(localHour))
  return idx >= 0 ? idx : 0
})

const nextHours = computed(() => {
  if (!weatherData.value) return []
  const start = currentHourIndex.value
  const h = weatherData.value.hourly
  return h.time.slice(start, start + 14).map((t, i) => {
    const idx = start + i
    const temp = Math.round(h.temperature_2m[idx] ?? 0)
    const feels = Math.round(h.apparent_temperature[idx] ?? 0)
    const prevTemp = Math.round(h.temperature_2m[idx - 1] ?? temp)
    const rain = h.precipitation_probability[idx] ?? 0
    const wind = Math.round(h.wind_speed_10m[idx] ?? 0)
    const vis = Math.round((h.visibility[idx] ?? 10000) / 1000)
    const cloud = h.cloud_cover[idx] ?? 0
    const code = h.weather_code[idx]
    const condLabel = (WMO_CODES[code] || WMO_CODES[0]).label

    // Build a rich prediction hint
    let hint = condLabel
    if (rain >= 70)        hint = `🌧 ${rain}% rain`
    else if (rain >= 40)   hint = `🌦 ${rain}% rain`
    else if (cloud >= 80)  hint = `☁️ Overcast`
    else if (wind >= 30)   hint = `💨 Windy ${wind} km/h`
    else if (vis < 3)      hint = `🌫 Fog ${vis} km`
    else if (temp > prevTemp + 1) hint = `↑ Warming ${temp}°`
    else if (temp < prevTemp - 1) hint = `↓ Cooling ${temp}°`
    else if (feels < temp - 3)    hint = `Feels ${feels}°`

    return { time: i === 0 ? 'Now' : formatHour(t), temp, feels, rain, wind, vis, cloud, hint, code, isCurrent: i === 0 }
  })
})

const dailyForecast = computed(() => {
  if (!weatherData.value) return []
  return weatherData.value.daily.time.map((d, i) => ({
    day: i === 0 ? 'Today' : new Date(d).toLocaleDateString('en-US', { weekday: 'short' }),
    hi: Math.round(weatherData.value!.daily.temperature_2m_max[i] ?? 0),
    lo: Math.round(weatherData.value!.daily.temperature_2m_min[i] ?? 0),
    code: weatherData.value!.daily.weather_code[i] ?? 0,
    rain: Math.round((weatherData.value!.daily.precipitation_sum[i] ?? 0) * 10) / 10,
    rainChance: weatherData.value!.daily.precipitation_probability_max[i] ?? 0,
    windMax: Math.round(weatherData.value!.daily.wind_speed_10m_max[i] ?? 0),
    uvMax: Math.round(weatherData.value!.daily.uv_index_max?.[i] ?? 0),
    sunrise: weatherData.value!.daily.sunrise[i]?.slice(11, 16),
    sunset: weatherData.value!.daily.sunset[i]?.slice(11, 16),
  }))
})

const weatherSummary = computed(() => {
  if (!weatherData.value) return ''
  const d = weatherData.value.daily
  const tomorrow = WMO_CODES[d.weather_code[1] ?? 0] || WMO_CODES[0]
  const hiTomorrow = Math.round(d.temperature_2m_max[1] ?? 0)
  const loTomorrow = Math.round(d.temperature_2m_min[1] ?? 0)
  const dayAfter = WMO_CODES[d.weather_code[2] ?? 0] || WMO_CODES[0]
  return `Tomorrow: ${tomorrow.label}, ${loTomorrow}–${hiTomorrow}°C. ${dayAfter.label} expected ${new Date(d.time[2] ?? '').toLocaleDateString('en-US', { weekday: 'long' })}.`
})

// Today's rain chance from daily forecast (index 0)
const todayRain = computed(() => {
  if (!weatherData.value) return null
  const chance = weatherData.value.daily.precipitation_probability_max[0] ?? 0
  const sum    = Math.round((weatherData.value.daily.precipitation_sum[0] ?? 0) * 10) / 10
  let label = 'Unlikely'
  let color = 'rgba(255,255,255,0.15)'
  let text  = 'rgba(255,255,255,0.5)'
  if (chance >= 70) { label = 'Very likely'; color = 'rgba(59,130,246,0.35)'; text = '#93c5fd' }
  else if (chance >= 40) { label = 'Possible';   color = 'rgba(99,102,241,0.25)'; text = '#a5b4fc' }
  else if (chance >= 20) { label = 'Slight';      color = 'rgba(148,163,184,0.15)'; text = '#cbd5e1' }
  return { chance, sum, label, color, text }
})

// AI Weather Insights — rule-based analysis of current conditions
const aiInsights = computed(() => {
  if (!weatherData.value) return null
  const c = weatherData.value.current
  const today = dailyForecast.value[0]
  const temp    = Math.round(c.temperature_2m)
  const feels   = Math.round(c.apparent_temperature)
  const humidity = c.relative_humidity_2m
  const wind    = Math.round(c.wind_speed_10m)
  const uv      = c.uv_index ?? 0
  const cloud   = c.cloud_cover ?? 0
  const rain    = today?.rainChance ?? 0
  const bg      = condition.value?.bg || 'clear-day'

  let clothing = ''
  let tempTip  = ''
  if      (temp >= 38) { clothing = 'Ultra-light & loose clothing'; tempTip = 'Extreme heat — stay hydrated & cool' }
  else if (temp >= 32) { clothing = 'Light clothes, hat & shades';  tempTip = 'Very hot — limit midday outdoor time' }
  else if (temp >= 25) { clothing = 'T-shirt & shorts';             tempTip = 'Warm & pleasant outside' }
  else if (temp >= 18) { clothing = 'Light jacket or long sleeves'; tempTip = 'Comfortable with a light layer' }
  else if (temp >= 10) { clothing = 'Warm jacket & layers';         tempTip = 'Cool — bundle up before heading out' }
  else                 { clothing = 'Heavy coat, gloves & scarf';   tempTip = 'Cold — minimise time outdoors' }

  let uvTip = ''
  if      (uv >= 11) uvTip = 'Extreme UV — stay indoors 10am–4pm'
  else if (uv >= 8)  uvTip = 'Very high — SPF 50+ is essential'
  else if (uv >= 6)  uvTip = 'High — wear sunscreen & hat'
  else if (uv >= 3)  uvTip = 'Moderate — sunscreen recommended'
  else               uvTip = 'Low — minimal protection needed'

  let windTip = ''
  if      (wind >= 62) windTip = 'Storm-force winds — stay indoors'
  else if (wind >= 40) windTip = 'Strong winds — secure loose items'
  else if (wind >= 25) windTip = 'Windy — hold onto your hat!'
  else if (wind >= 15) windTip = 'Breezy — pleasant conditions'
  else                 windTip = 'Calm winds — ideal outdoors'

  let humidityTip = ''
  if      (humidity >= 80) humidityTip = 'Very humid — feels muggy & sticky'
  else if (humidity >= 60) humidityTip = 'Comfortable humidity levels'
  else if (humidity < 30)  humidityTip = 'Dry air — drink plenty of water'
  else                     humidityTip = 'Ideal humidity for comfort'

  let activity = ''
  if (bg === 'thunderstorm') activity = 'Stay indoors — dangerous conditions ⚡'
  else if (rain >= 70)       activity = 'Take a strong umbrella ☂️'
  else if (rain >= 40)       activity = 'Carry a light raincoat 🌦'
  else if (temp >= 28 && cloud < 40) activity = 'Great day for the beach 🏖️'
  else if (temp >= 20 && rain < 20)  activity = 'Ideal for outdoor activities 🚶'
  else if (temp < 10)        activity = 'Hot drinks & indoor comfort ☕'
  else                       activity = 'Casual outdoor walk is fine 🌿'

  const airQuality = 'Good (AQI 25)' // Placeholder, integrate API for real data
  const sunrise = today?.sunrise ?? '—'
  const sunset = today?.sunset ?? '—'
  const daylightHours = today?.sunrise && today?.sunset
    ? Math.max(0, Math.round((new Date(`1970-01-01T${today.sunset}:00`).getTime() - new Date(`1970-01-01T${today.sunrise}:00`).getTime()) / 36e5 * 10) / 10)
    : null
  const solarPath = `${formatClockTime(sunrise)} → ${formatClockTime(sunset)}`
  const rawMoonrise = astronomyData.value?.moonrise
  const rawMoonset = astronomyData.value?.moonset
  const moonrise = formatClockTime(rawMoonrise)
  const moonset = formatClockTime(rawMoonset)
  const hasMoonrise = moonrise !== '—'
  const hasMoonset = moonset !== '—'
  const moonPath = hasMoonrise || hasMoonset
    ? `${hasMoonrise ? moonrise : 'No moonrise'} · ${hasMoonset ? moonset : 'No moonset'}`
    : 'Moonrise and moonset unavailable today'
  const moonPhase = astronomyData.value?.moon_phase ?? 'Live lunar data unavailable'
  const moonIllumination = astronomyData.value?.moon_illumination ?? '—'

  return { clothing, tempTip, feels, uvTip, uv, windTip, wind, humidityTip, humidity, activity, rain, airQuality, solarPath, moonPath, daylightHours, moonPhase, moonIllumination }
})

const displayTimeZone = computed(() => weatherData.value?.timezone || weatherData.value?.location?.timezone)

const liveClock = computed(() => now.value.toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZone: displayTimeZone.value,
}))

const liveDate = computed(() => now.value.toLocaleDateString('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: displayTimeZone.value,
}))

const safeLiveClock = computed(() => isClientMounted.value ? liveClock.value : '--:--:--')
const safeLiveDate = computed(() => isClientMounted.value ? liveDate.value : '--- -- ---')

const sunDirection = computed(() => {
  if (!weatherData.value || !dailyForecast.value.length) return '—'

  const today = dailyForecast.value[0]
  const sunrise = today?.sunrise
  const sunset = today?.sunset

  if (!sunrise || !sunset) return '—'

  const timeZone = displayTimeZone.value
  const nowParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now.value)

  const hour = Number(nowParts.find(part => part.type === 'hour')?.value ?? 0)
  const minute = Number(nowParts.find(part => part.type === 'minute')?.value ?? 0)
  const currentMinutes = (hour * 60) + minute

  const parseClockMinutes = (value: string) => {
    const [h, m] = value.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return (h * 60) + m
  }

  const sunriseMinutes = parseClockMinutes(sunrise)
  const sunsetMinutes = parseClockMinutes(sunset)

  if (sunriseMinutes == null || sunsetMinutes == null || sunsetMinutes <= sunriseMinutes) return '—'
  if (currentMinutes < sunriseMinutes || currentMinutes > sunsetMinutes) return 'Below horizon'

  const progress = (currentMinutes - sunriseMinutes) / (sunsetMinutes - sunriseMinutes)
  const northernHemisphere = (weatherData.value.latitude ?? 0) >= 0
  const arc = northernHemisphere
    ? ['E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W']
    : ['E', 'ENE', 'NE', 'NNE', 'N', 'NNW', 'NW', 'WNW', 'W']

  const index = Math.min(arc.length - 1, Math.max(0, Math.round(progress * (arc.length - 1))))
  return arc[index]
})

function formatHour(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
}

function formatClockTime(value?: string) {
  if (!value || value === '—' || /no moonrise|no moonset/i.test(value)) return '—'
  if (/am|pm/i.test(value)) return value.toUpperCase()

  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value

  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function getWindDir(deg?: number) {
  if (deg === undefined) return '—'
  const dirs = ['N','NE','E','SE','S','SW','W','NW']
  return dirs[Math.round(deg / 45) % 8]
}

async function resolveLocationDetails(lat: number, lon: number): Promise<ResolvedLocation> {
  try {
    const geo: any = await $fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    )

    return {
      name: geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.county || 'My Location',
      country: geo.address?.country_code?.toUpperCase() ?? '',
    }
  } catch {
    return {
      name: 'My Location',
      country: '',
    }
  }
}

async function fetchByCoords(lat: number, lon: number, locationName?: string) {
  loading.value = true
  error.value = null
  try {
    const locationPromise = locationName
      ? Promise.resolve<ResolvedLocation>({ name: locationName, country: '' })
      : resolveLocationDetails(lat, lon)

    const res: any = await $fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&models=best_match` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,uv_index,cloud_cover,surface_pressure,visibility` +
      `&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,wind_speed_10m,visibility,cloud_cover` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset` +
      `&timezone=auto&forecast_days=7`
    )

    weatherData.value = {
      ...res,
      location: { name: locationName || 'My Location', country: '' }
    }

    const resolvedLocation = await locationPromise

    if (weatherData.value?.latitude === res.latitude && weatherData.value?.longitude === res.longitude) {
      weatherData.value.location = resolvedLocation
    }

    // Persist so next refresh restores this location
    if (import.meta.client) {
      localStorage.setItem('weather_last', JSON.stringify({
        lat,
        lon,
        name: resolvedLocation.name,
        country: resolvedLocation.country,
      }))
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to fetch weather data'
  } finally {
    loading.value = false
  }
}

async function fetchWeather(city: string = 'London') {
  if (!city.trim()) return   // guard: ignore empty searches
  loading.value = true
  error.value = null
  try {
    const geoRes: any = await $fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    )
    if (!geoRes.results?.length) throw new Error(`City "${city}" not found`)

    const { latitude, longitude, name, country } = geoRes.results[0]
    await fetchByCoords(latitude, longitude, name)
    if (weatherData.value) {
      weatherData.value.location = { name, country }
    }
    searchQuery.value = ''
  } catch (err: any) {
    error.value = err.message || 'Failed to fetch weather data'
    loading.value = false
  }
}

async function fetchAstronomy(lat: number, lon: number) {
  try {
    astronomyData.value = await $fetch('/api/astronomy', {
      query: { lat, lon }
    })
  } catch {
    astronomyData.value = null
  }
}

const locating = ref(false)

function useCurrentLocation() {
  if (!navigator.geolocation) {
    error.value = 'Geolocation is not supported by your browser'
    return
  }
  locating.value = true
  error.value = null
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      await fetchByCoords(pos.coords.latitude, pos.coords.longitude)
      locating.value = false
    },
    () => {
      error.value = 'Location access denied'
      locating.value = false
    },
    { timeout: 8000 }
  )
}

onMounted(() => {
  isClientMounted.value = true
  if (import.meta.client) {
    clockTimer = setInterval(() => {
      now.value = new Date()
    }, 1000)

    const saved = localStorage.getItem('weather_last')
    if (saved) {
      try {
        const { lat, lon, name, country } = JSON.parse(saved)
        fetchByCoords(lat, lon, name).then(() => {
          if (weatherData.value) weatherData.value.location = { name, country }
        })
        return
      } catch { /* fall through */ }
    }
  }
  fetchWeather('London')
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})

watch(
  () => [weatherData.value?.latitude, weatherData.value?.longitude] as const,
  ([lat, lon]) => {
    if (typeof lat === 'number' && typeof lon === 'number') {
      fetchAstronomy(lat, lon)
    } else {
      astronomyData.value = null
    }
  },
  { immediate: true }
)

// Scroll helpers for horizontal forecast strips
const hourlyRef = ref<HTMLElement | null>(null)
const tilesRef  = ref<HTMLElement | null>(null)

function scrollStrip(el: HTMLElement | null, dir: 1 | -1) {
  if (!el) return
  el.scrollBy({ left: dir * 200, behavior: 'smooth' })
}

// Weather particle helpers
function dropStyle(n: number): string {
  const left = ((n * 2.47) % 100).toFixed(1)
  const delay = ((n * 0.13) % 2.5).toFixed(2)
  const dur   = (0.55 + (n % 5) * 0.12).toFixed(2)
  const op    = (0.25 + (n % 4) * 0.12).toFixed(2)
  const h     = 14 + (n % 3) * 6
  return `left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;opacity:${op};height:${h}px`
}

function flakeStyle(n: number): string {
  const left  = ((n * 3.3) % 100).toFixed(1)
  const delay = ((n * 0.22) % 4).toFixed(2)
  const dur   = (5 + (n % 5) * 1.5).toFixed(1)
  const size  = 10 + (n % 3) * 5
  return `left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;font-size:${size}px`
}

function starStyle(n: number): string {
  const left  = ((n * 2.01) % 100).toFixed(1)
  const top   = ((n * 1.73) % 75).toFixed(1)
  const delay = ((n * 0.15) % 4).toFixed(2)
  const dur   = (2 + (n % 3)).toFixed(1)
  const size  = 1 + (n % 3)
  return `left:${left}%;top:${top}%;animation-delay:${delay}s;animation-duration:${dur}s;width:${size}px;height:${size}px`
}

function fogStyle(n: number): string {
  const top   = (10 + n * 18) + 'vh'
  const delay = (n * 2.5).toFixed(1)
  const dur   = (18 + n * 4).toFixed(1)
  const op    = (0.04 + n * 0.012).toFixed(3)
  return `top:${top};animation-delay:${delay}s;animation-duration:${dur}s;opacity:${op}`
}

function leafStyle(n: number): string {
  const top   = ((n * 13.7) % 85).toFixed(1)
  const delay = ((n * 0.37) % 5).toFixed(2)
  const dur   = (3.5 + (n % 5) * 0.9).toFixed(1)
  const size  = 12 + (n % 4) * 5
  const rot   = n * 43
  const emoji = ['🍃','🍂','🌿','🍁'][n % 4]
  return `top:${top}%;animation-delay:${delay}s;animation-duration:${dur}s;font-size:${size}px;--rot:${rot}deg;--emoji:"${emoji}"`
}
</script>

<template>
  <div class="weather-bg" :style="bgStyle">

    <!-- Weather FX Particle Overlay -->
    <div class="weather-fx" aria-hidden="true" v-if="condition">
      <!-- Rain drops -->
      <template v-if="condition?.bg === 'rainy' || condition?.bg === 'thunderstorm'">
        <span v-for="n in 45" :key="'d'+n" class="wx-drop" :style="dropStyle(n)"></span>
      </template>
      <!-- Snow flakes -->
      <template v-if="condition?.bg === 'snowy'">
        <span v-for="n in 30" :key="'f'+n" class="wx-flake" :style="flakeStyle(n)">❄</span>
      </template>
      <!-- Night stars -->
      <template v-if="condition?.bg === 'clear-night'">
        <span v-for="n in 55" :key="'s'+n" class="wx-star" :style="starStyle(n)"></span>
      </template>
      <!-- Thunderstorm: diagonal rain + 3 independent lightning bolts + flying debris -->
      <template v-if="condition?.bg === 'thunderstorm'">
        <span class="wx-lightning wx-bolt-1"></span>
        <span class="wx-lightning wx-bolt-2"></span>
        <span class="wx-lightning wx-bolt-3"></span>
        <!-- Flying storm debris / leaves -->
        <span v-for="n in 15" :key="'l'+n" class="wx-leaf" :style="leafStyle(n)"></span>
      </template>
      <!-- Fog layers -->
      <template v-if="condition?.bg === 'foggy'">
        <span v-for="n in 5" :key="'g'+n" class="wx-fog" :style="fogStyle(n)"></span>
      </template>
      <!-- Clear day sun glow -->
      <span v-if="condition?.bg === 'clear-day'" class="wx-sun-glow"></span>
    </div>

    <!-- Header Section -->
    <header class="app-header">
      <div class="logo-container">
        <img src="/logo.png" alt="SkyCast Logo" class="app-logo" />
        <span class="app-name">SkyCast</span>
      </div>
      <div class="top-clock" aria-label="Current time">
        <span class="top-clock-time">{{ safeLiveClock }}</span>
        <span class="top-clock-date">{{ safeLiveDate }}</span>
        <span class="top-clock-date">☀ {{ sunDirection }}</span>
      </div>
    </header>

    <div class="search-container" @focusout="e => { if (e.currentTarget && !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) showSuggestions = false }">
      <input
        id="city-search"
        v-model="searchQuery"
        type="text"
        placeholder="Search city, district, country…"
        class="search-input"
        autocomplete="off"
        @input="onSearchInput"
        @focus="showSuggestions = true"
        @keyup.enter="fetchWeather(searchQuery); showSuggestions = false"
        @keyup.escape="showSuggestions = false"
      />
      <button id="search-submit-btn" class="search-btn" aria-label="Search" @click="fetchWeather(searchQuery); showSuggestions = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Search
      </button>

      <!-- Autocomplete Dropdown -->
      <div v-if="showSuggestions && suggestions.length" class="suggestions-dropdown">
        <button
          v-for="s in suggestions"
          :key="s.id"
          class="suggestion-item"
          @mousedown.prevent="selectSuggestion(s)"
        >
          <span class="suggestion-name">{{ s.name }}</span>
          <span class="suggestion-sub">{{ formatSuggestion(s) }}</span>
        </button>
      </div>
    </div>

    <!-- Current Location Button -->
    <button id="location-btn" class="location-btn" @click="useCurrentLocation" :disabled="locating">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        :class="{ 'spin-slow': locating }">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" v-if="locating"/>
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" v-if="!locating"/>
        <line x1="12" y1="2" x2="12" y2="5" v-if="!locating"/>
        <line x1="12" y1="19" x2="12" y2="22" v-if="!locating"/>
        <line x1="2" y1="12" x2="5" y2="12" v-if="!locating"/>
        <line x1="19" y1="12" x2="22" y2="12" v-if="!locating"/>
      </svg>
      {{ locating ? 'Locating…' : 'Use My Location' }}
    </button>

    <!-- Loading -->
    <Transition name="fade">
      <div v-if="loading" class="glass-card state-card">
        <div class="spinner" aria-label="Loading"></div>
        <p>Fetching weather…</p>
      </div>
    </Transition>

    <!-- Error -->
    <Transition name="fade">
      <div v-if="error && !loading" class="glass-card state-card">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
          fill="none" stroke="rgba(255,100,100,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          style="margin: 0 auto 1rem">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style="color: rgba(255,160,160,0.95)">{{ error }}</p>
      </div>
    </Transition>

    <!-- Main Content -->
    <Transition name="fade">
      <div v-if="weatherData && !loading" class="weather-layout">

        <!-- TOP ROW: Current Weather (left) + AI Insights (right) -->
        <div class="weather-top-row">

          <!-- ① Current Weather Card -->
          <div class="glass-card current-weather" v-if="weatherData">
            <div class="current-header">
              <div class="location-info">
                <p class="location-name">{{ weatherData?.location?.name }}</p>
                <p class="location-country">{{ weatherData?.location?.country }}</p>
              </div>
              <div class="current-time">
                {{ safeLiveClock }}
              </div>
            </div>

            <!-- Weather Icon (SVG inline based on condition) -->
            <div class="weather-icon-large">
              <!-- Sun -->
              <svg v-if="condition?.icon === 'sun'" xmlns="http://www.w3.org/2000/svg" width="90" height="90"
                viewBox="0 0 24 24" fill="none" stroke="rgba(255,220,50,1)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              <!-- Moon -->
              <svg v-else-if="condition?.icon === 'moon'" xmlns="http://www.w3.org/2000/svg" width="80" height="80"
                viewBox="0 0 24 24" fill="rgba(200,200,255,0.5)" stroke="rgba(200,210,255,1)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
              <!-- Cloud -->
              <svg v-else-if="condition?.icon === 'cloud'" xmlns="http://www.w3.org/2000/svg" width="90" height="90"
                viewBox="0 0 24 24" fill="none" stroke="rgba(200,220,255,0.9)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
              </svg>
              <!-- Fog -->
              <svg v-else-if="condition?.icon === 'cloud-fog'" xmlns="http://www.w3.org/2000/svg" width="90" height="90"
                viewBox="0 0 24 24" fill="none" stroke="rgba(200,220,255,0.8)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.5 8H9a7 7 0 1 0 6.71 9H17.5a4.5 4.5 0 0 0 0-9z"/>
                <line x1="3" y1="17" x2="21" y2="17"/><line x1="5" y1="20" x2="19" y2="20"/>
              </svg>
              <!-- Drizzle -->
              <svg v-else-if="condition?.icon === 'cloud-drizzle'" xmlns="http://www.w3.org/2000/svg" width="90" height="90"
                viewBox="0 0 24 24" fill="none" stroke="rgba(150,200,255,0.9)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/>
                <line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/>
                <line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/>
                <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
              </svg>
              <!-- Rain -->
              <svg v-else-if="condition?.icon === 'cloud-rain'" xmlns="http://www.w3.org/2000/svg" width="90" height="90"
                viewBox="0 0 24 24" fill="none" stroke="rgba(100,180,255,0.9)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/>
                <line x1="12" y1="15" x2="12" y2="23"/>
                <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
              </svg>
              <!-- Snow -->
              <svg v-else-if="condition?.icon === 'cloud-snow'" xmlns="http://www.w3.org/2000/svg" width="90" height="90"
                viewBox="0 0 24 24" fill="none" stroke="rgba(200,220,255,0.95)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/>
                <line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/>
                <line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/>
                <line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/>
              </svg>
              <!-- Lightning -->
              <svg v-else-if="condition?.icon === 'cloud-lightning'" xmlns="http://www.w3.org/2000/svg" width="90" height="90"
                viewBox="0 0 24 24" fill="none" stroke="rgba(255,220,60,0.95)" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>
                <polyline points="13 11 9 17 15 17 11 23"/>
              </svg>
              <span v-else class="i-fallback">☁️</span>
            </div>

            <div class="temp-display">
              <span class="temp-big">{{ Math.round(weatherData?.current?.temperature_2m ?? 0) }}</span>
              <span class="temp-deg">°C</span>
            </div>
            <p class="condition-label">{{ condition?.label }}</p>
            <p class="feels-like">Feels like {{ Math.round(weatherData?.current?.apparent_temperature ?? 0) }}°C</p>

          <!-- Today's Rain Chance Badge -->
          <div v-if="todayRain" class="rain-badge" :style="{ background: todayRain.color }">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              style="flex-shrink:0">
              <line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/>
              <line x1="12" y1="15" x2="12" y2="23"/>
              <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
            </svg>
            <span :style="{ color: todayRain.text }">
              Rain today: <strong>{{ todayRain.chance }}%</strong> &mdash; {{ todayRain.label }}
              <span v-if="todayRain.sum > 0" style="opacity:0.7"> &middot; {{ todayRain.sum }}mm</span>
            </span>
          </div>
          <!-- Rain probability bar -->
          <div v-if="todayRain && todayRain.chance > 0" class="today-rain-bar-bg">
            <div class="today-rain-bar-fill" :style="{ width: todayRain.chance + '%', background: todayRain.chance >= 70 ? '#60a5fa' : todayRain.chance >= 40 ? '#818cf8' : '#94a3b8' }"></div>
          </div>
          <p v-if="weatherSummary" class="weather-prediction">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              style="display:inline; vertical-align: middle; margin-right: 5px;">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {{ weatherSummary }}
          </p>

          <!-- Stat grid: 6 items in 3-col layout -->
          <div class="details-grid details-grid-3" style="margin-top: 1.2rem">
            <div class="detail-item">
              <span class="detail-label">Humidity</span>
              <span class="detail-value">{{ weatherData?.current?.relative_humidity_2m }}<span class="detail-unit">%</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Wind</span>
              <span class="detail-value">{{ Math.round(weatherData?.current?.wind_speed_10m ?? 0) }}<span class="detail-unit"> km/h</span></span>
              <span class="detail-unit">{{ getWindDir(weatherData?.current?.wind_direction_10m) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Gusts</span>
              <span class="detail-value">{{ Math.round(weatherData?.current?.wind_gusts_10m ?? 0) }}<span class="detail-unit"> km/h</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Cloud Cover</span>
              <span class="detail-value">{{ weatherData?.current?.cloud_cover ?? '&mdash;' }}<span class="detail-unit">%</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Visibility</span>
              <span class="detail-value">{{ weatherData?.current?.visibility != null ? Math.round((weatherData?.current?.visibility ?? 0) / 1000) : '&mdash;' }}<span class="detail-unit"> km</span></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">UV Index</span>
              <span class="detail-value">{{ weatherData?.current?.uv_index ?? '&mdash;' }}</span>
              <div class="uv-bar-bg">
                <div class="uv-bar-fill" :style="{ width: Math.min((weatherData?.current?.uv_index ?? 0) / 11 * 100, 100) + '%' }"></div>
              </div>
            </div>
          </div>
          </div><!-- /current-weather card -->

          <!-- AI Insights Sidebar (right) -->
          <aside v-if="aiInsights && weatherData" class="weather-sidebar">
            <div class="glass-card ai-panel">
              <div class="ai-header">
                <span class="ai-badge">✦ AI Insights</span>
              </div>
              <p class="ai-sub" style="margin-bottom:0.85rem;margin-top:-0.5rem">{{ weatherData?.location?.name }}</p>
              <div class="ai-grid">
                <div class="ai-item"><span class="ai-icon">🎯</span><div class="ai-item-body"><span class="ai-item-label">Activity</span><span class="ai-item-value">{{ aiInsights.activity }}</span></div></div>
                <div class="ai-item"><span class="ai-icon">👕</span><div class="ai-item-body"><span class="ai-item-label">What to Wear</span><span class="ai-item-value">{{ aiInsights.clothing }}</span></div></div>
                <div class="ai-item"><span class="ai-icon">🌡️</span><div class="ai-item-body"><span class="ai-item-label">Feels {{ aiInsights.feels }}°C</span><span class="ai-item-value">{{ aiInsights.tempTip }}</span></div></div>
                <div class="ai-item"><span class="ai-icon">☀️</span><div class="ai-item-body"><span class="ai-item-label">UV {{ aiInsights.uv }}</span><span class="ai-item-value">{{ aiInsights.uvTip }}</span></div></div>
                <div class="ai-item"><span class="ai-icon">💨</span><div class="ai-item-body"><span class="ai-item-label">Wind {{ aiInsights.wind }} km/h</span><span class="ai-item-value">{{ aiInsights.windTip }}</span></div></div>
                <div class="ai-item"><span class="ai-icon">💧</span><div class="ai-item-body"><span class="ai-item-label">Humidity {{ aiInsights.humidity }}%</span><span class="ai-item-value">{{ aiInsights.humidityTip }}</span></div></div>
                <div class="ai-item"><span class="ai-icon">🌧️</span><div class="ai-item-body"><span class="ai-item-label">Rain Chance</span><span class="ai-item-value">{{ aiInsights.rain }}% today</span></div></div>
                <div class="ai-item"><span class="ai-icon">🌬️</span><div class="ai-item-body"><span class="ai-item-label">Air Quality</span><span class="ai-item-value">{{ aiInsights.airQuality }}</span></div></div>
              </div>
              <div class="sky-paths">
                <div class="sky-path-card solar-path-card">
                  <div class="sky-path-head">
                    <span class="sky-path-icon">☀️</span>
                    <span class="sky-path-title">Solar Path</span>
                  </div>
                  <div class="sky-visual solar-visual" aria-hidden="true">
                    <svg viewBox="0 0 220 90" class="sky-visual-svg">
                      <defs>
                        <linearGradient id="solarArc" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stop-color="rgba(255,255,255,0.2)" />
                          <stop offset="50%" stop-color="rgba(250,204,21,0.95)" />
                          <stop offset="100%" stop-color="rgba(255,255,255,0.2)" />
                        </linearGradient>
                      </defs>
                      <path d="M18 68 Q110 8 202 68" class="sky-arc-path solar-arc" />
                      <circle cx="110" cy="26" r="11" class="sky-body sun-body" />
                      <line x1="110" y1="8" x2="110" y2="0" class="sun-ray" />
                      <line x1="110" y1="52" x2="110" y2="44" class="sun-ray" />
                      <line x1="92" y1="26" x2="84" y2="26" class="sun-ray" />
                      <line x1="136" y1="26" x2="128" y2="26" class="sun-ray" />
                      <line x1="97" y1="13" x2="90" y2="6" class="sun-ray" />
                      <line x1="123" y1="39" x2="130" y2="46" class="sun-ray" />
                      <line x1="97" y1="39" x2="90" y2="46" class="sun-ray" />
                      <line x1="123" y1="13" x2="130" y2="6" class="sun-ray" />
                      <circle cx="18" cy="68" r="3" class="sky-anchor" />
                      <circle cx="202" cy="68" r="3" class="sky-anchor" />
                    </svg>
                  </div>
                  <p class="sky-path-time">{{ aiInsights.solarPath }}</p>
                  <p class="sky-path-meta">
                    Daylight {{ aiInsights.daylightHours ?? '—' }} hrs
                  </p>
                </div>
                <div class="sky-path-card moon-path-card">
                  <div class="sky-path-head">
                    <span class="sky-path-icon">🌙</span>
                    <span class="sky-path-title">Moon Path</span>
                  </div>
                  <div class="sky-visual moon-visual" aria-hidden="true">
                    <svg viewBox="0 0 220 90" class="sky-visual-svg">
                      <path d="M18 62 Q110 22 202 62" class="sky-arc-path moon-arc" />
                      <path d="M114 24a13 13 0 1 0 0 26a11 11 0 1 1 0-26z" class="sky-body moon-body" />
                      <circle cx="84" cy="28" r="1.8" class="moon-star" />
                      <circle cx="140" cy="18" r="1.8" class="moon-star" />
                      <circle cx="156" cy="34" r="1.4" class="moon-star" />
                      <circle cx="18" cy="62" r="3" class="sky-anchor" />
                      <circle cx="202" cy="62" r="3" class="sky-anchor" />
                    </svg>
                  </div>
                  <p class="sky-path-time">{{ aiInsights.moonPath }}</p>
                  <p class="sky-path-meta">{{ aiInsights.moonPhase }} · {{ aiInsights.moonIllumination }}% illumination</p>
                </div>
              </div>
            </div>
          </aside>

        </div><!-- /weather-top-row -->

        <!-- BOTTOM ROW: Hourly (left) + 7-Day (right) -->
        <div class="weather-bottom-row">
          <!-- Hourly Forecast -->
          <div class="glass-card weather-full">
            <div class="card-header">
              <p class="section-title" style="margin-bottom:0">Hourly Forecast &amp; Predictions</p>
              <div class="scroll-arrows">
                <button class="scroll-arrow" aria-label="Scroll left" @click="scrollStrip(hourlyRef, -1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button class="scroll-arrow" aria-label="Scroll right" @click="scrollStrip(hourlyRef, 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
            <div class="hourly-list" ref="hourlyRef">
              <div
                v-for="h in nextHours"
                :key="h.time"
                :class="['hourly-item', { active: h.isCurrent }]"
              >
                <span class="hourly-time">{{ h.time }}</span>
                <span class="hourly-temp">{{ h.temp }}°</span>
                <span class="hourly-hint">{{ h.hint }}</span>
                <!-- Mini stats row -->
                <div class="hourly-stats">
                  <span class="hstat" title="Feels like"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>{{ h.feels }}°</span>
                  <span class="hstat" title="Wind"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>{{ h.wind }}</span>
                  <span class="hstat" title="Cloud cover"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>{{ h.cloud }}%</span>
                  <span class="hstat" title="Visibility"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>{{ h.vis }}km</span>
                </div>
                <div v-if="h.rain > 0" class="rain-bar-bg"><div class="rain-bar-fill" :style="{ width: h.rain + '%' }"></div></div>
                <span v-if="h.rain > 0" class="hourly-rain">{{ h.rain }}% rain</span>
              </div>
            </div>
          </div>

          <!-- 7-Day Forecast -->
          <div class="glass-card weather-full">
            <div class="card-header">
              <p class="section-title" style="margin-bottom:0">7-Day Forecast</p>
              <div class="scroll-arrows">
                <button class="scroll-arrow" aria-label="Scroll left" @click="scrollStrip(tilesRef, -1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button class="scroll-arrow" aria-label="Scroll right" @click="scrollStrip(tilesRef, 1)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
            <div class="forecast-tiles" ref="tilesRef">
              <div v-for="d in dailyForecast" :key="d.day" class="forecast-tile">
                <span class="tile-day">{{ d.day }}</span>
                <span class="tile-icon">
                  <svg v-if="(WMO_CODES[d.code]||WMO_CODES[0]).icon==='sun'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,220,50,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
                  <svg v-else-if="(WMO_CODES[d.code]||WMO_CODES[0]).icon==='cloud-rain'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(100,180,255,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>
                  <svg v-else-if="(WMO_CODES[d.code]||WMO_CODES[0]).icon==='cloud-lightning'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,220,60,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(200,220,255,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>
                </span>
                <span class="tile-condition">{{ (WMO_CODES[d.code]||WMO_CODES[0]).label }}</span>
                <div class="tile-temps"><span class="tile-hi">{{ d.hi }}°</span><span class="tile-lo">{{ d.lo }}°</span></div>
                <div class="tile-stats">
                  <span class="tstat" title="Rain chance"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>{{ d.rainChance }}%</span>
                  <span class="tstat" title="Rain sum"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6m0 0C6.48 8 2 12.48 2 18a10 10 0 0 0 20 0c0-5.52-4.48-10-10-10z"/></svg>{{ d.rain }}mm</span>
                  <span class="tstat" title="Max wind"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#a3e635" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>{{ d.windMax }}</span>
                  <span class="tstat" title="UV max"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>UV {{ d.uvMax }}</span>
                </div>
                <div class="tile-sun"><span class="sun-item">🌅 {{ d.sunrise }}</span><span class="sun-item">🌇 {{ d.sunset }}</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <p style="font-size: 0.75rem; color: rgba(255,255,255,0.3); text-align: center; padding-bottom: 1rem; margin-top: 1rem;">
          Data from Open-Meteo &nbsp;·&nbsp; Updated just now
        </p>

      </div><!-- /weather-layout -->
    </Transition>
  </div>
</template>
