<script setup lang="ts">
defineProps<{
  rows: Array<{
    display_name: string
    completed_requests: number
    right_size_rate: number
    isYou?: boolean
  }>
}>()
</script>

<template>
  <section class="rail-block">
    <h2>Your efficiency</h2>
    <div class="table-scroll">
      <table class="board">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Requests</th>
            <th>Right-size</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in rows" :key="row.display_name" :class="{ you: row.isYou }">
            <td class="mono">{{ idx + 1 }}</td>
            <td>{{ row.display_name }}</td>
            <td class="mono">{{ row.completed_requests }}</td>
            <td class="mono">{{ row.right_size_rate }}%</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="rail-note">Only opted-in users with positive right-size results and at least 10 requests appear here.</p>
  </section>
</template>