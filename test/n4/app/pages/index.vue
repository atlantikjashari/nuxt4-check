<script setup>
const { data, status } = await useFetch('/api/x')
if (data.value === undefined) console.log('none')
</script>
