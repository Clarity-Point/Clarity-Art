<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router';
import { ref, computed, nextTick, watch } from 'vue';
import SidebarMenu from '@/components/SidebarMenu.vue';
import GlobalHeader from '@/components/GlobalHeader.vue';
import ToastCenter from '@/components/ToastCenter.vue';

const route = useRoute();
const mainContent = ref<HTMLElement | null>(null);

// The mobile drawer. On desktop the sidebar is always visible, so this
// only governs the off-canvas overlay on narrow screens.
const isDrawerOpen = ref(false);
const toggleSidebar = () => {
  isDrawerOpen.value = !isDrawerOpen.value;
};
const closeSidebar = () => {
  isDrawerOpen.value = false;
};

// Auth screens (login / register) have their own full-bleed layout —
// no chrome so the entrance feels calm and focused.
const isChromeless = computed(() => route.meta.public === true);

// Close the mobile drawer whenever the route changes.
watch(
  () => route.fullPath,
  async () => {
    closeSidebar();
    await nextTick();
    mainContent.value?.focus({ preventScroll: true });
  },
);
</script>

<template>
  <a v-if="!isChromeless" class="skip-link" href="#main-content">Перейти к содержанию</a>
  <!-- Chromeless: login / register render on their own -->
  <RouterView v-if="isChromeless" />

  <!-- App shell: persistent sidebar + header + content -->
  <div v-else id="app-shell">
    <GlobalHeader :drawer-open="isDrawerOpen" @toggle-sidebar="toggleSidebar" />
    <SidebarMenu :is-open="isDrawerOpen" @close="closeSidebar" />

    <div class="app-body">
      <main id="main-content" ref="mainContent" tabindex="-1">
        <RouterView />
      </main>
    </div>

    <transition name="fade">
      <div v-if="isDrawerOpen" class="scrim" @click="closeSidebar"></div>
    </transition>
  </div>
  <ToastCenter />
</template>

<style scoped>
#app-shell {
  min-height: 100vh;
}

.app-body {
  padding-top: var(--header-h);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: padding-left var(--transition);
}

main {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
main:focus {
  outline: none;
}
.skip-link {
  position: fixed;
  left: var(--space-3);
  top: -80px;
  z-index: var(--z-skip-link);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--primary-color);
  color: var(--on-primary);
  transition: top var(--transition);
}
.skip-link:focus {
  top: var(--space-3);
}

/* Scrim behind the mobile drawer */
.scrim {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: var(--z-scrim);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Desktop: the sidebar is a permanent rail; content sits beside it. */
@media (min-width: 1024px) {
  .app-body {
    padding-left: var(--sidebar-w);
  }
  .scrim {
    display: none !important;
  }
}
</style>
