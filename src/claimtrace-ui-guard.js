window.claimtraceApiMode = Boolean(import.meta.env.VITE_CLAIMTRACE_API_BASE);

const originalRenderTelemetry = window.claimtraceRenderTelemetry;
const reconstructionScreen = () => document.querySelector('[data-screen="reconstruction"]');

if (typeof originalRenderTelemetry === 'function') {
  window.claimtraceRenderTelemetry = (payload = {}) => {
    const screen = reconstructionScreen();
    if (screen?.hidden) {
      window.__claimTracePendingTelemetry = payload;
      return false;
    }
    return originalRenderTelemetry(payload);
  };
}

const flushPendingTelemetry = () => {
  const screen = reconstructionScreen();
  const pending = window.__claimTracePendingTelemetry;
  if (!screen || screen.hidden || !pending || typeof originalRenderTelemetry !== 'function') return;
  window.__claimTracePendingTelemetry = null;
  requestAnimationFrame(() => originalRenderTelemetry(pending));
};

const screen = reconstructionScreen();
if (screen) {
  new MutationObserver(flushPendingTelemetry).observe(screen, {
    attributes: true,
    attributeFilter: ['hidden'],
  });
}
