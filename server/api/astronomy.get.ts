export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const lat = Number(query.lat)
  const lon = Number(query.lon)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid lat and lon are required' })
  }

  const config = useRuntimeConfig(event)
  const apiKey = config.weatherApiKey

  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'WEATHERAPI_KEY is not configured' })
  }

  const date = new Date().toISOString().slice(0, 10)
  const response: any = await $fetch('https://api.weatherapi.com/v1/astronomy.json', {
    query: {
      key: apiKey,
      q: `${lat},${lon}`,
      dt: date,
    },
  })

  const astro = response?.astronomy?.astro

  if (!astro) {
    throw createError({ statusCode: 502, statusMessage: 'Astronomy data unavailable from WeatherAPI' })
  }

  return {
    moonrise: astro.moonrise,
    moonset: astro.moonset,
    moon_phase: astro.moon_phase,
    moon_illumination: astro.moon_illumination,
    sunrise: astro.sunrise,
    sunset: astro.sunset,
  }
})