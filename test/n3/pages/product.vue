<script setup lang="ts">
const route = useRoute()
const { data, pending, refresh } = await useFetch('/api/p', { immediate: false })
if (data.value === null) console.log('none')
data.value.title = 'x'
refresh({ dedupe: true })
const n = route.meta.name
useHead({ meta: [{ hid: 'desc', name: 'description', content: 'x' }] })
const st = window.__NUXT__
</script>
<template><KeepAlive include="SomeCard"><div /></KeepAlive></template>
