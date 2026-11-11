export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n', '@pinia/nuxt'],
  experimental: { treeshakeClientOnly: true },
  generate: { routes: ['/a'] },
})
