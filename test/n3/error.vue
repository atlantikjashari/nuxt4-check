<script setup>
const props = defineProps(['error'])
const d = JSON.parse(props.error.data)
</script>
