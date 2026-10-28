// The host page's CSS cannot reach into the shadow root, and `all: initial`
// on the root stops inherited properties (font, color, line-height) leaking in.
export const HOST_STYLE =
  'all:initial!important;position:absolute!important;top:0!important;left:0!important;' +
  'width:0!important;height:0!important;margin:0!important;padding:0!important;' +
  'border:0!important;display:block!important;z-index:2147483647!important;' +
  'pointer-events:none!important;contain:style!important'

export const OVERLAY_CSS = `
:host{all:initial}
.root{all:initial;--ink:#ececef;--muted:#a1a1aa;--faint:#71717a;--accent:#8580ff;--primary:#3a33e8;
--glass:rgba(24,24,27,.84);--line:rgba(255,255,255,.08);--hover:rgba(255,255,255,.07);--on:rgba(255,255,255,.13);
font:500 12.5px/1.35 "Inter Tight",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
color:var(--ink);font-feature-settings:"tnum" 1,"cv11" 1;-webkit-font-smoothing:antialiased;letter-spacing:-.005em}
.root *,.root *::before,.root *::after{box-sizing:border-box}
.layer{position:absolute;top:0;left:0;pointer-events:none;transition:opacity .2s ease}
.layer[hidden],[hidden]{display:none!important}
canvas.layer{opacity:.6}
canvas.layer.fixed{position:fixed}
.scroll{position:absolute;top:0;left:0;pointer-events:none}
.rail{position:absolute;top:0;right:0;bottom:0;width:6px;opacity:.9}
.mark-line{position:absolute;left:0;right:6px;height:0;border-top:1px dashed rgba(58,51,232,.55)}
.mark-line.fold{border-top:1.5px solid var(--primary)}
.mark-line span{position:absolute;right:14px;top:-11px;padding:3px 8px;border-radius:999px;background:var(--glass);
color:var(--ink);font-size:11px;white-space:nowrap;box-shadow:0 4px 14px -4px rgba(0,0,0,.45);
-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4)}
.mark-line.fold span{background:var(--primary);color:#fff}
.dock{position:fixed;left:12px;right:12px;bottom:20px;display:flex;flex-direction:column;
align-items:center;gap:8px;pointer-events:none}
.glass{pointer-events:auto;background:var(--glass);border:1px solid var(--line);
-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);
box-shadow:0 18px 40px -12px rgba(0,0,0,.55),0 2px 6px -2px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06)}
.bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;padding:6px;border-radius:16px}
.status{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 10px;padding:6px 12px;
border-radius:999px;color:var(--muted);font-size:12px;min-height:30px}
.status b{color:var(--ink);font-weight:600}
.status .note{color:var(--faint)}
.status .warn{color:#fbbf24}
.status .err{color:#fca5a5}
.dot{width:3px;height:3px;border-radius:50%;background:var(--faint)}
.brand{display:flex;align-items:center;gap:7px;padding:0 8px 0 6px;color:var(--ink);font-weight:600}
.brand svg{width:18px;height:18px;flex:none}
.brand svg path{fill:var(--accent);stroke:none}
.seg{display:flex;padding:3px;gap:2px;border-radius:10px;background:rgba(255,255,255,.05);
box-shadow:inset 0 0 0 1px rgba(255,255,255,.04)}
button{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;
height:26px;min-width:26px;padding:0 9px;border-radius:7px;color:var(--muted);white-space:nowrap;
transition:background .15s ease,color .15s ease}
button:hover{background:var(--hover);color:var(--ink)}
button[aria-pressed="true"]{background:var(--on);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.3)}
.icon{padding:0;width:32px;height:32px;border-radius:10px}
.seg .icon{width:26px;height:26px;border-radius:7px}
button:focus-visible,.select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
svg path{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.sep{width:1px;height:20px;background:var(--line);margin:0 2px}
.select{all:unset;box-sizing:border-box;cursor:pointer;height:26px;line-height:26px;padding:0 26px 0 10px;border-radius:7px;color:var(--ink);
background:rgba(255,255,255,.05) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23a1a1aa' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E") no-repeat right 8px center;
box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.select:hover{background-color:var(--hover)}
.select option{color:#18181b}
.switch{gap:8px;padding:0 9px 0 6px}
.track{position:relative;width:26px;height:16px;border-radius:999px;background:rgba(255,255,255,.18);transition:background .15s ease}
.track::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;
box-shadow:0 1px 2px rgba(0,0,0,.35);transition:transform .15s ease}
.switch[aria-checked="true"]{color:var(--ink)}
.switch[aria-checked="true"] .track{background:var(--primary)}
.switch[aria-checked="true"] .track::after{transform:translateX(10px)}
.pill{gap:4px;padding:4px 4px 4px 6px;border-radius:14px}
.skeleton{display:inline-block;width:180px;height:10px;border-radius:5px;
background:linear-gradient(90deg,rgba(255,255,255,.06) 25%,rgba(255,255,255,.16) 50%,rgba(255,255,255,.06) 75%);
background-size:200% 100%;animation:shimmer 1.3s linear infinite}
@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
.box{position:fixed;pointer-events:none;border-radius:6px;border:1.5px solid var(--accent);
background:rgba(133,128,255,.08);box-shadow:0 0 0 4px rgba(133,128,255,.14);transition:all .08s ease-out}
.tip{position:fixed;pointer-events:none;padding:6px 10px;border-radius:10px;font-size:12px;white-space:nowrap;color:var(--muted)}
.tip b{color:var(--ink);font-weight:600}
@media (prefers-reduced-motion:reduce){.root *{transition:none!important;animation:none!important}}
`
