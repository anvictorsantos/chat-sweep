/**
 * Overlay styling. Everything lives inside a shadow root, so page CSS cannot
 * reach it and nothing here can leak out into the host page. Colours follow a
 * dark palette that stays legible over both ChatGPT's and Claude's themes.
 */

export const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: block;
  pointer-events: none;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: #ceced3;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
*, *::before, *::after { box-sizing: border-box; }

.layer { position: absolute; inset: 0; }

.badge {
  position: absolute;
  top: 0;
  left: 0;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 8px;
  border: 1px solid #3f3f46;
  background: rgba(20, 20, 25, 0.92);
  color: #a1a1aa;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.badge svg { width: 14px; height: 14px; opacity: 0; }
.badge:hover { border-color: #71717a; background: #1a1a21; color: #ceced3; }
.badge.is-selected { background: #f97316; border-color: #f97316; color: #0b0b0f; }
.badge.is-selected svg { opacity: 1; }
.badge[hidden] { display: none; }

.toolbar {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  max-width: min(94vw, 760px);
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #27272a;
  background: rgba(11, 11, 15, 0.95);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(12px);
  pointer-events: auto;
}

.toolbar__mode { font-weight: 600; color: #f4f4f5; }
.toolbar__count { color: #a1a1aa; font-variant-numeric: tabular-nums; }
.toolbar__hint { color: #74747f; font-size: 11px; }
.toolbar__spacer { flex: 1 1 auto; }
.toolbar progress { width: 120px; accent-color: #f97316; }

button.action {
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #27272a;
  background: #1a1a21;
  color: #ceced3;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
button.action:hover:not(:disabled) { background: #23232b; border-color: #3f3f46; }
button.action:disabled { opacity: 0.45; cursor: not-allowed; }
button.action--primary { background: #f97316; border-color: #f97316; color: #0b0b0f; font-weight: 600; }
button.action--primary:hover:not(:disabled) { background: #fb8c3c; border-color: #fb8c3c; }
button.action--danger { background: #ef4444; border-color: #ef4444; color: #0b0b0f; font-weight: 600; }
button.action--danger:hover:not(:disabled) { background: #f26363; border-color: #f26363; }
button.action--ghost { background: transparent; }

.scrim {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(5, 5, 8, 0.74);
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.dialog {
  width: 100%;
  max-width: 540px;
  max-height: min(84vh, 640px);
  overflow: auto;
  padding: 22px;
  border-radius: 14px;
  border: 1px solid #27272a;
  background: #141419;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
}
.dialog:focus { outline: none; }
.dialog h2 {
  margin: 0 0 10px;
  font-size: 19px;
  line-height: 1.25;
  color: #f4f4f5;
}
.dialog ul { margin: 0 0 14px; padding-left: 18px; color: #ceced3; }
.dialog li { margin-bottom: 6px; }
.dialog li::marker { color: #f97316; }
.dialog__consequence {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-left: 3px solid #f59e0b;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.09);
  color: #f5c26b;
  font-weight: 600;
}
.dialog__preview { margin: 0 0 16px; padding: 0; list-style: none; }
.dialog__preview li {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #a1a1aa;
  font-size: 12px;
}
.dialog__preview li span { color: #74747f; }
.dialog label { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 12px; }
.dialog input[type="checkbox"] { margin-top: 3px; accent-color: #f97316; }
.dialog input[type="text"] {
  width: 100%;
  height: 36px;
  margin-bottom: 16px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #3f3f46;
  background: #101014;
  color: #ceced3;
  font: inherit;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}
.dialog__field-label { display: block; margin-bottom: 6px; color: #a1a1aa; font-size: 12px; }
.dialog__actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }

.toast {
  position: absolute;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  align-items: center;
  max-width: min(92vw, 560px);
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #27272a;
  background: #1a1a21;
  color: #ceced3;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
}
.toast__text { min-width: 0; }

button.action:focus-visible,
.badge:focus-visible,
.dialog input:focus-visible {
  outline: 2px solid #f97316;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .badge { transition: none; }
  * { animation: none !important; }
}

@media (max-width: 640px) {
  .toolbar { bottom: 10px; padding: 8px; gap: 6px; }
  .toolbar__hint { display: none; }
  .dialog { padding: 16px; }
}
`;
