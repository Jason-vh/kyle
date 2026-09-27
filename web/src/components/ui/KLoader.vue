<template>
  <span
    class="grid grid-cols-[repeat(4,0.75em)] grid-rows-[repeat(5,0.75em)] gap-[0.25em]"
    aria-hidden="true"
  >
    <span
      v-for="block in BLOCKS"
      :key="block.key"
      class="animate-k-trace rounded-[0.14em] bg-current opacity-22 motion-reduce:animate-none motion-reduce:opacity-100"
      :style="block.style"
    />
  </span>
</template>

<script setup lang="ts">
const STEP_MS = 135;

const K_SHAPE: [column: number, row: number][] = [
  [0, 0],
  [3, 0],
  [0, 1],
  [2, 1],
  [0, 2],
  [1, 2],
  [0, 3],
  [2, 3],
  [0, 4],
  [3, 4],
];

const BLOCKS = K_SHAPE.map(([column, row]) => ({
  key: `${column}-${row}`,
  style: {
    gridColumn: column + 1,
    gridRow: row + 1,
    animationDelay: `${litOrder(column, row) * STEP_MS}ms`,
  },
}));

function litOrder(column: number, row: number) {
  if (column === 0) return 2 - Math.abs(row - 2);
  return column + 2;
}
</script>
