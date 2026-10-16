<template>
  <div class="simple-chart" tabindex="0" role="img" :aria-label="ariaLabel">
    <svg viewBox="0 0 800 300" preserveAspectRatio="none" :style="{ height: `${height}px` }">
      <line v-for="tick in gridTicks" :key="tick.y" x1="54" x2="784" :y1="tick.y" :y2="tick.y" />
      <text
        v-for="tick in gridTicks"
        :key="`label-${tick.y}`"
        x="46"
        :y="tick.y + 4"
        text-anchor="end"
      >
        {{ tick.label }}
      </text>
      <polyline v-if="coordinates.length > 1" :points="polyline" />
      <circle
        v-for="point in coordinates"
        :key="`${point.x}-${point.label}`"
        :cx="point.x"
        :cy="point.y"
        r="5"
      >
        <title>{{ point.label }}: {{ point.value }}</title>
      </circle>
      <text
        v-for="label in xLabels"
        :key="`${label.x}-${label.text}`"
        :x="label.x"
        y="292"
        :text-anchor="label.anchor"
      >
        {{ label.text }}
      </text>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Point {
  x: string | number;
  y: number;
}

const props = withDefaults(
  defineProps<{
    points?: Point[];
    minY?: number;
    maxY?: number;
    height?: number;
    ariaLabel?: string;
    valueFormatter?: (value: number) => string;
  }>(),
  {
    // Defaulted like every other prop: without it the bounds computed below
    // throws on the first render of a chart that is shown before its data
    // arrives, taking the whole view down with it.
    points: () => [],
    minY: 0,
    maxY: undefined,
    height: 300,
    ariaLabel: 'Линейный график',
    valueFormatter: (value: number) => String(Math.round(value)),
  },
);

const left = 54;
const right = 784;
const top = 18;
const bottom = 266;

const bounds = computed(() => {
  const observedMax = props.points.reduce((max, point) => Math.max(max, point.y), props.minY + 1);
  const max = props.maxY ?? observedMax;
  return { min: props.minY, max: max > props.minY ? max : props.minY + 1 };
});

const formatDate = (value: string | number) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
};

const coordinates = computed(() =>
  props.points.map((point, index) => {
    const x =
      props.points.length === 1
        ? (left + right) / 2
        : left + (index / (props.points.length - 1)) * (right - left);
    const ratio = (point.y - bounds.value.min) / (bounds.value.max - bounds.value.min);
    return {
      x,
      y: bottom - Math.min(1, Math.max(0, ratio)) * (bottom - top),
      value: props.valueFormatter(point.y),
      label: formatDate(point.x),
    };
  }),
);

const polyline = computed(() =>
  coordinates.value.map((point) => `${point.x},${point.y}`).join(' '),
);

const gridTicks = computed(() =>
  [0, 0.5, 1].map((ratio) => {
    const value = bounds.value.max - ratio * (bounds.value.max - bounds.value.min);
    return { y: top + ratio * (bottom - top), label: props.valueFormatter(value) };
  }),
);

const xLabels = computed(() => {
  if (!coordinates.value.length) return [];
  const indexes = [
    ...new Set([0, Math.floor((coordinates.value.length - 1) / 2), coordinates.value.length - 1]),
  ];
  return indexes.map((index) => ({
    x: coordinates.value[index].x,
    text: coordinates.value[index].label,
    anchor:
      index === 0
        ? ('start' as const)
        : index === coordinates.value.length - 1
          ? ('end' as const)
          : ('middle' as const),
  }));
});
</script>

<style scoped>
.simple-chart {
  width: 100%;
  overflow-x: auto;
}
svg {
  display: block;
  width: 100%;
  min-width: 520px;
}
line {
  stroke: var(--border-color);
  stroke-dasharray: 5 5;
  vector-effect: non-scaling-stroke;
}
polyline {
  fill: none;
  stroke: var(--primary-color);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
circle {
  fill: var(--accent-color);
  stroke: var(--card-bg);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
text {
  fill: var(--muted-text);
  font: 12px var(--font-sans);
}
</style>
