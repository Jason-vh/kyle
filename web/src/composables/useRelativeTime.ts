import { ref, onMounted, onUnmounted } from "vue";

function computeRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();
  const secs = Math.floor(diff / 1000);

  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) {
    return (
      "Yesterday at " + date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  }
  if (days < 7) {
    return (
      date.toLocaleDateString("en-US", { weekday: "long" }) +
      " at " +
      date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function useRelativeTime(iso: string) {
  const text = ref(computeRelativeTime(iso));
  let interval: ReturnType<typeof setInterval>;

  onMounted(() => {
    interval = setInterval(() => {
      text.value = computeRelativeTime(iso);
    }, 60_000);
  });

  onUnmounted(() => {
    clearInterval(interval);
  });

  return text;
}

// Non-reactive helper for use outside setup context (e.g. computed)
export function relativeTime(iso: string): string {
  return computeRelativeTime(iso);
}
