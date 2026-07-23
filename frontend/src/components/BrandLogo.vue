<script setup lang="ts">
/**
 * Точка Ясности brand mark — a connected-nodes "network" glyph with the
 * blue→violet brand gradient. Self-contained (its own colours), so it reads on
 * any light surface. Size is controlled by the `size` prop.
 *
 * Usage: <BrandLogo :size="20" />
 */
withDefaults(defineProps<{ size?: number | string }>(), { size: 24 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Точка Ясности"
  >
    <defs>
      <linearGradient
        id="brandGrad"
        x1="46"
        y1="12"
        x2="20"
        y2="50"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#2f6bff" />
        <stop offset="0.55" stop-color="#4d54f0" />
        <stop offset="1" stop-color="#7c3aed" />
      </linearGradient>
    </defs>

    <!-- Links (behind the nodes) -->
    <g
      stroke="url(#brandGrad)"
      stroke-width="2.6"
      stroke-linecap="round"
    >
      <line x1="30" y1="31" x2="18.5" y2="18" />
      <line x1="30" y1="31" x2="42" y2="17" />
      <line x1="30" y1="31" x2="41" y2="37" />
      <line x1="30" y1="31" x2="24" y2="46" />
    </g>

    <!-- Nodes -->
    <g fill="url(#brandGrad)">
      <circle cx="30" cy="31" r="5.2" />
      <circle cx="18.5" cy="18" r="4" />
      <circle cx="42" cy="17" r="4.6" />
      <circle cx="41" cy="37" r="3" />
      <circle cx="24" cy="46" r="3.8" />
    </g>
  </svg>
</template>
