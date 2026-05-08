// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'SkyCast - Premium Weather Experience',
      meta: [
        { name: 'description', content: 'A beautiful, real-time weather application with high-fidelity animations and accurate forecasts.' }
      ]
    }
  }
})
