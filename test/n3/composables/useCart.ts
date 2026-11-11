export const useCart = () => useAsyncData('cart', () => $fetch('/api/cart'), {
  getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key],
})
