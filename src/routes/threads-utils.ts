export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline SVG icons for interface types */
export const SLACK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2a2.5 2.5 0 0 0 0 5H17V4.5A2.5 2.5 0 0 0 14.5 2z"/><path d="M7 5h3.5"/><path d="M2 9.5a2.5 2.5 0 0 0 5 0V7H4.5A2.5 2.5 0 0 0 2 9.5z"/><path d="M5 12v3.5"/><path d="M9.5 22a2.5 2.5 0 0 0 0-5H7v2.5A2.5 2.5 0 0 0 9.5 22z"/><path d="M12 19h5"/><path d="M22 14.5a2.5 2.5 0 0 0-5 0V17h2.5a2.5 2.5 0 0 0 2.5-2.5z"/><path d="M19 12V7"/></svg>`;

export const DISCORD_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`;

/** Share link icon (small, used on cards and thread header) */
export const SHARE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;

/** CSS custom property palette — shared between list and detail pages */
export const CSS_PALETTE = `
  :root {
    --bg-base: #0c1018;
    --bg-surface: #131a24;
    --bg-elevated: #1a2332;
    --bg-input: #0f1620;
    --border-subtle: #1e2a38;
    --border-muted: #253344;
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --accent-blue: #60a5fa;
    --accent-green: #34d399;
    --accent-purple: #a78bfa;
    --accent-amber: #fbbf24;
    --accent-red: #f87171;
    --accent-cyan: #22d3ee;
  }`;

/** Client-side JS for relative timestamps. Converts <time datetime> elements. */
export const RELATIVE_TIME_JS = `
function relativeTime(date) {
  var now = Date.now();
  var diff = now - date.getTime();
  var secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  if (days === 1) {
    return 'Yesterday at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' }) + ' at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function updateTimes() {
  document.querySelectorAll('time[datetime]').forEach(function(el) {
    var d = new Date(el.getAttribute('datetime'));
    if (!isNaN(d.getTime())) el.textContent = relativeTime(d);
  });
}
updateTimes();
setInterval(updateTimes, 60000);`;
