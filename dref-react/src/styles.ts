/**
 * Scoped stylesheet injected once by the composer. Every rule is namespaced
 * under `.dc` and every colour resolves the host's design tokens first
 * (the dref.dev site: --bg-surface/--accent/…, strims dashboards: --bg-surface-subtle,
 * --rose, --amber, --emerald…) so the component blends in light or dark themes.
 * Hosts can override any `--dc-*` variable on a parent element.
 */
export const COMPOSER_CSS = `
.dc {
  --dc-bg: var(--bg-surface, #ffffff);
  --dc-bg-subtle: var(--bg-surface-subtle, var(--bg-surface-elevated, var(--bg-subtle, #f5f7fa)));
  --dc-bg-input: var(--bg-input, var(--dc-bg));
  --dc-bg-sidebar: var(--bg-sidebar, var(--dc-bg-subtle));
  --dc-bg-hover: var(--bg-hover, var(--bg-surface-hover, #f1f1f4));
  --dc-border: var(--border, #dfe4eb);
  --dc-border-strong: var(--border-strong, #b4bdca);
  --dc-text: var(--text-primary, #1d1d22);
  --dc-text-2: var(--text-secondary, #56565f);
  --dc-muted: var(--text-muted, #67758a);
  --dc-accent: var(--accent, var(--brand, #2563eb));
  --dc-danger: var(--danger, var(--status-danger, var(--rose, #d93b3b)));
  --dc-warning: var(--warning, var(--status-warning, var(--amber, #c77c02)));
  --dc-success: var(--success, var(--status-healthy, var(--emerald, #14855b)));
  --dc-mono: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  --dc-sans: var(--font-sans, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
  --dc-radius: var(--radius-md, 6px);
  --dc-radius-sm: var(--radius-sm, 4px);
  --dc-sidebar: 248px;
  --dc-space: 8px;
  font-family: var(--dc-sans);
  font-size: 13px;
  line-height: 1.45;
  color: var(--dc-text);
  background: var(--dc-bg);
  border: 1px solid var(--dc-border);
  border-radius: var(--dc-radius);
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  container-type: inline-size;
  -webkit-font-smoothing: antialiased;
}
.dc *, .dc *::before, .dc *::after { box-sizing: border-box; }
.dc button, .dc input, .dc select, .dc textarea { font: inherit; margin: 0; }
.dc input, .dc select, .dc textarea { color: var(--dc-text); }
.dc :is(button, summary, input, select, textarea):focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 2px; }
.dc [hidden] { display: none !important; }
.dc p { margin: 0; }
.dc-mono { font-family: var(--dc-mono); font-size: 12.5px; }
.dc-muted { color: var(--dc-muted); }
.dc-small { font-size: 12px; }

/* toolbar */
.dc-toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 16px; border-bottom: 1px solid var(--dc-border); background: var(--dc-bg);
}
.dc-toolbar-title { display: flex; align-items: center; gap: 8px; min-width: 0; margin-right: auto; }
.dc-brand-icon { color: var(--dc-accent); width: 28px; height: 28px; display: grid; place-items: center; background: color-mix(in srgb, var(--dc-accent) 10%, transparent); border-radius: var(--dc-radius-sm); }
.dc-toolbar-title strong { font-size: 14.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dc-tabs { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--dc-border); border-radius: var(--dc-radius-sm); background: var(--dc-bg); }
.dc-tab { border: 0; background: transparent; padding: 4px 12px; border-radius: 4px; cursor: pointer; color: var(--dc-text-2); font-weight: 550; }
.dc-tab[aria-selected="true"] { background: var(--dc-bg-subtle); color: var(--dc-accent); }
.dc-actions { display: inline-flex; gap: 6px; flex-wrap: wrap; align-items: center; }

/* buttons */
.dc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px;
  border: 1px solid var(--dc-border); border-radius: var(--dc-radius-sm); background: var(--dc-bg);
  cursor: pointer; font-weight: 550; font-size: 12.5px; white-space: nowrap; color: var(--dc-text);
}
.dc-btn:hover:not(:disabled) { border-color: var(--dc-border-strong); background: var(--dc-bg-hover); }
.dc-btn:disabled { opacity: .5; cursor: not-allowed; }
.dc-btn-primary { background: var(--dc-accent); border-color: var(--dc-accent); color: var(--text-on-accent, #fff); }
.dc-btn-primary:hover:not(:disabled) { background: var(--dc-accent); filter: brightness(1.08); }
.dc-btn-danger { color: var(--dc-danger); }
.dc-btn-danger-solid { background: var(--dc-danger); border-color: var(--dc-danger); color: #fff; }
.dc-btn-ghost { border-color: transparent; background: transparent; }
.dc-btn-sm { height: 30px; padding: 0 10px; font-size: 12px; }
.dc-icon-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
  border: 1px solid transparent; border-radius: 5px; background: transparent; cursor: pointer; color: var(--dc-muted); padding: 0;
}
.dc-icon-btn:hover:not(:disabled) { background: var(--dc-bg-hover); color: var(--dc-text); border-color: var(--dc-border); }
.dc-icon-btn:disabled { opacity: .3; cursor: default; }
.dc-icon-btn.dc-danger:hover:not(:disabled) { color: var(--dc-danger); }
.dc-link { border: 0; background: none; padding: 0; color: var(--dc-accent); cursor: pointer; font-weight: 550; }
.dc-link:hover { text-decoration: underline; }

/* status pill */
.dc-pill {
  display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: 999px;
  font-size: 12px; font-weight: 600; border: 1px solid transparent; white-space: nowrap; cursor: default; background: none;
}
button.dc-pill { cursor: pointer; }
.dc-pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.dc-pill-valid { color: var(--dc-success); background: color-mix(in srgb, var(--dc-success) 12%, transparent); }
.dc-pill-warnings { color: var(--dc-warning); background: color-mix(in srgb, var(--dc-warning) 14%, transparent); }
.dc-pill-invalid { color: var(--dc-danger); background: color-mix(in srgb, var(--dc-danger) 12%, transparent); }
.dc-pill-neutral { color: var(--dc-muted); background: var(--dc-bg); border-color: var(--dc-border); }
.dc-pill-neutral::before { display: none; }

/* body layout */
.dc-body { display: grid; grid-template-columns: var(--dc-sidebar) minmax(0, 1fr); min-height: 0; flex: 1; }
.dc-body-single { display: block; flex: 1; min-height: 0; }
.dc-scroll { overflow: auto; min-height: 0; }

/* sidebar */
.dc-sidebar { border-right: 1px solid var(--dc-border); background: var(--dc-bg-sidebar); padding: 12px 10px; display: flex; flex-direction: column; gap: 6px; }
.dc-side-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 8px 4px; }
.dc-side-head > span { font-size: 10px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--dc-muted); }
.dc-nav {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 8px; border-radius: var(--dc-radius-sm);
  border: 1px solid transparent; background: transparent; cursor: pointer; color: var(--dc-text); min-width: 0;
}
.dc-nav:hover { background: var(--dc-bg-hover); }
.dc-nav-settings { border-color: var(--dc-border); background: var(--dc-bg-subtle); }
.dc-nav-settings > svg { color: var(--dc-accent); }
.dc-nav-settings:hover { border-color: var(--dc-border-strong); background: var(--dc-bg-hover); }
.dc-nav > svg { color: var(--dc-muted); flex-shrink: 0; }
.dc-nav[aria-current="true"] { background: color-mix(in srgb, var(--dc-accent) 9%, var(--dc-bg)); border-color: transparent; box-shadow: inset 2px 0 0 var(--dc-accent); }
.dc-nav[aria-current="true"] .dc-nav-label { color: var(--dc-accent); font-weight: 600; }
.dc-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-nav-meta { font-size: 11px; color: var(--dc-muted); white-space: nowrap; }
.dc-nav-group { margin-left: 28px; padding-left: 8px; border-left: 1px solid var(--dc-border); }
.dc-nav-scope { font-size: 12px; color: var(--dc-text-2); font-weight: 600; }
.dc-nav-model .dc-nav-label { font-size: 12.5px; }
.dc-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.dc-dot-err { background: var(--dc-danger); }
.dc-dot-warn { background: var(--dc-warning); }
.dc-count-err { font-size: 11px; font-weight: 700; color: var(--dc-danger); }
.dc-search { margin: 4px 0; }

/* main panel */
.dc-main { padding: 24px 28px 32px; display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.dc-panel-head { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.dc-panel-head > div:first-child { flex: 1; min-width: 220px; }
.dc-kicker { font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--dc-muted); margin-bottom: 4px; }
.dc-title { font-family: var(--dc-sans); font-size: 24px; font-weight: 650; letter-spacing: -.035em; margin: 4px 0 8px; word-break: break-word; }
.dc-section { display: flex; flex-direction: column; gap: 16px; }
.dc-section-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; flex-wrap: wrap; }
.dc-section-head h4 { margin: 0; font-size: 14px; font-weight: 600; }
.dc-section-head p { margin: 2px 0 0; font-size: 12px; color: var(--dc-muted); }
.dc-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.dc-grid-2 { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.dc-card { border: 1px solid var(--dc-border); border-radius: var(--dc-radius); background: var(--dc-bg); }
.dc-card-body { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.dc-empty { padding: 14px; border: 1px dashed var(--dc-border); border-radius: var(--dc-radius); color: var(--dc-muted); text-align: center; font-size: 12.5px; }
.dc-empty-rich { padding: 40px 24px; display: flex; flex-direction: column; gap: 12px; align-items: center; background: var(--dc-bg-subtle); border-style: solid; }
.dc-empty-title { font-weight: 650; font-size: 13px; color: var(--dc-text-2); }
.dc-empty-hint { max-width: 460px; line-height: 1.5; }
.dc-panel-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--dc-muted); }

/* model sub-navigation (Fields / Mappings) */
.dc-subnav { display: flex; gap: 24px; border-bottom: 1px solid var(--dc-border); }
.dc-subnav-tab { display: inline-flex; align-items: center; gap: 8px; border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 10px 0 12px; cursor: pointer; color: var(--dc-muted); font-weight: 550; font-size: 12.5px; margin-bottom: -1px; }
.dc-subnav-tab:hover { color: var(--dc-text); }
.dc-subnav-tab[aria-selected="true"] { border-bottom-color: var(--dc-accent); color: var(--dc-accent); }
.dc-subnav-tab .dc-nav-meta { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: var(--dc-bg-subtle); }
.dc-subview[hidden] { display: none; }

/* fields */
.dc-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dc-label { font-size: 11.5px; font-weight: 600; color: var(--dc-text-2); display: flex; gap: 6px; align-items: baseline; }
.dc-hint { font-size: 11.5px; color: var(--dc-muted); }
.dc-hint-err { font-size: 11.5px; color: var(--dc-danger); }
.dc-input, .dc-select, .dc-textarea {
  width: 100%; min-width: 0; height: 30px; padding: 0 9px; border: 1px solid var(--dc-border);
  border-radius: var(--dc-radius-sm); background: var(--dc-bg-input); outline: none; font-size: 13px;
}
.dc-select { padding-right: 4px; cursor: pointer; }
.dc-textarea { height: auto; min-height: 58px; padding: 7px 9px; resize: vertical; }
.dc-input:focus, .dc-select:focus, .dc-textarea:focus { border-color: var(--dc-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dc-accent) 18%, transparent); }
.dc-input[aria-invalid="true"] { border-color: var(--dc-danger); }
.dc-input-sm, .dc-select-sm { height: 26px; font-size: 12.5px; padding: 0 7px; }
.dc-value { min-height: 30px; display: flex; align-items: center; word-break: break-word; }
.dc-check { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; font-size: 12.5px; }
.dc-check input { appearance: none; display: grid; place-content: center; background: var(--dc-bg-input); border: 1px solid var(--dc-border-strong); border-radius: 3px; width: 14px; height: 14px; margin: 0; cursor: pointer; }
.dc-check input:checked { background: var(--dc-accent); border-color: var(--dc-accent); }
.dc-check input:checked::before { content: ''; width: 7px; height: 4px; border-left: 1.5px solid var(--text-on-accent, #fff); border-bottom: 1.5px solid var(--text-on-accent, #fff); transform: translateY(-1px) rotate(-45deg); }

/* properties table */
.dc-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--dc-border); border-radius: var(--dc-radius); overflow: hidden; }
.dc-table th {
  text-align: left; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .05em; color: var(--dc-muted);
  padding: 7px 8px; background: var(--dc-bg-subtle); border-bottom: 1px solid var(--dc-border); white-space: nowrap;
}
.dc-table td { padding: var(--table-py, 9px) var(--table-px, 8px); border-bottom: 1px solid var(--dc-border); vertical-align: middle; }
.dc-table tbody tr:hover > td { background: color-mix(in srgb, var(--dc-bg-subtle) 60%, transparent); }
.dc-table :is(.dc-input, .dc-select) { border-color: transparent; background-color: transparent; }
.dc-table tr:hover :is(.dc-input, .dc-select), .dc-table :is(.dc-input, .dc-select):focus { border-color: var(--dc-border); background-color: var(--dc-bg-input); }
.dc-table tr:last-child > td { border-bottom: 0; }
.dc-table tr.dc-row-open > td { background: color-mix(in srgb, var(--dc-accent) 4%, transparent); }
.dc-table tr.dc-row-err > td:first-child { box-shadow: inset 3px 0 0 var(--dc-danger); }
.dc-table td.dc-center, .dc-table th.dc-center { text-align: center; }
.dc-table .dc-detail > td { padding: 0; background: var(--dc-bg-subtle); }
.dc-detail-inner { padding: 10px 12px 12px 36px; display: flex; flex-direction: column; gap: 10px; }
.dc-detail-inner .dc-field { gap: 2px; }
.dc-grid-detail { grid-template-columns: 1fr minmax(130px, auto); align-items: start; }
@media (max-width: 560px) { .dc-grid-detail { grid-template-columns: 1fr; } }
.dc-row-actions { display: flex; gap: 2px; justify-content: flex-end; white-space: nowrap; }
.dc-chevron { transition: transform .12s ease; display: inline-block; }
.dc-icon-rule { color: var(--dc-muted); flex: none; display: inline-flex; }
.dc-icon-btn.dc-icon-rule:hover { color: var(--dc-accent); }
.dc-icon-authority { color: var(--dc-accent); flex: none; display: inline-flex; vertical-align: -2px; }
.dc-tip-host { display: inline-flex; }
.dc-tip {
  position: fixed; z-index: 9999; pointer-events: none;
  background: #23242b; color: #f4f5f7; border: 1px solid rgba(255, 255, 255, .09);
  padding: 5px 8px; border-radius: 5px; font-size: 12px; font-family: var(--dc-sans, system-ui, sans-serif);
  line-height: 1.45; max-width: 300px; white-space: normal; word-break: break-word;
  box-shadow: 0 3px 10px rgba(0, 0, 0, .22);
}
.dc-chevron[data-open="true"] { transform: rotate(90deg); }
.dc-cell-grip { width: 30px; padding-right: 0 !important; }

/* drag-and-drop reordering */
.dc-grip {
  display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 24px; padding: 0;
  border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--dc-muted);
  cursor: grab; touch-action: none;
}
.dc-grip:hover { background: var(--dc-bg-hover); color: var(--dc-text-2); border-color: var(--dc-border); }
.dc-grip:focus-visible { outline: 2px solid var(--dc-accent); outline-offset: 1px; }
.dc-grip:active { cursor: grabbing; }
.dc-row-dragging > td { opacity: .45; }
.dc-row-drop > td { box-shadow: inset 0 2px 0 var(--dc-accent); }
tr.dc-row-drop + tr.dc-detail > td { box-shadow: inset 0 2px 0 var(--dc-accent); }

/* chips */
.dc-chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.dc-chip {
  display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 1px 7px; border-radius: 3px; border: 1px solid var(--dc-border);
  background: var(--dc-bg-subtle); font-family: var(--dc-mono); font-size: 11.5px; line-height: 18px; color: var(--dc-text-2); white-space: nowrap;
}
.dc-chip b { font-weight: 500; color: var(--dc-text); overflow: hidden; text-overflow: ellipsis; }
.dc-chip-warn { border-color: color-mix(in srgb, var(--dc-warning) 45%, transparent); }
.dc-chip-accent { border-color: color-mix(in srgb, var(--dc-accent) 40%, transparent); color: var(--dc-accent); background: color-mix(in srgb, var(--dc-accent) 8%, transparent); }
.dc-badge { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 11px; font-weight: 650; line-height: 18px; background: var(--dc-bg-subtle); border: 1px solid var(--dc-border); color: var(--dc-text-2); }
.dc-badge-key { color: var(--dc-accent); border-color: color-mix(in srgb, var(--dc-accent) 35%, transparent); }

/* rule editor */
.dc-rule { display: grid; grid-template-columns: 150px minmax(0, 1fr) auto auto; gap: 8px; align-items: center; }
.dc-rule-type { font-family: var(--dc-mono); font-size: 12.5px; }
@media (max-width: 620px) { .dc-rule { grid-template-columns: 1fr; } }

/* mapping field table */
.dc-table-map th.dc-col-source, .dc-table-map th.dc-col-target { width: 22%; }
.dc-table-map td { vertical-align: top; padding-top: 8px; }
.dc-map-src { font-weight: 550; }
.dc-step { display: inline-flex; align-items: center; gap: 4px; }

/* issues */
.dc-issues { border: 1px solid color-mix(in srgb, var(--dc-danger) 35%, transparent); background: color-mix(in srgb, var(--dc-danger) 6%, transparent); border-radius: var(--dc-radius); padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
.dc-issues.dc-issues-warn { border-color: color-mix(in srgb, var(--dc-warning) 40%, transparent); background: color-mix(in srgb, var(--dc-warning) 7%, transparent); }
.dc-issue { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; }
.dc-issue code { font-family: var(--dc-mono); font-size: 11.5px; color: var(--dc-muted); }
.dc-issue-sev-error { color: var(--dc-danger); font-weight: 700; }
.dc-issue-sev-warning { color: var(--dc-warning); font-weight: 700; }
.dc-issue button { text-align: left; }

/* JSON */
.dc-json { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 18px; height: 100%; min-height: 0; }
.dc-json-editor {
  flex: 1; width: 100%; min-height: 420px; font-family: var(--dc-mono); font-size: 12.5px; line-height: 1.55; padding: 12px 14px;
  border: 1px solid var(--dc-border); border-radius: var(--dc-radius); background: var(--dc-bg-subtle); color: var(--dc-text);
  resize: vertical; outline: none; tab-size: 2; white-space: pre; overflow: auto; margin: 0;
}
.dc-json-editor:focus { border-color: var(--dc-accent); }
.dc-json-error { color: var(--dc-danger); font-size: 12.5px; font-family: var(--dc-mono); }
.dc-dropzone { outline: 2px dashed var(--dc-accent); outline-offset: -6px; }

/* Dashboard workspace hierarchy */
.dc-search-wrap { position: relative; margin: 2px 2px 10px; }
.dc-search-wrap > svg { position: absolute; left: 9px; top: 9px; color: var(--dc-muted); }
.dc-search-wrap .dc-input { padding-left: 30px; height: 32px; font-size: 12px; }
.dc-scope-heading { display: flex; align-items: center; min-width: 0; }
.dc-scope-heading > .dc-nav { flex: 1; min-width: 0; padding-left: 4px; }
.dc-scope-heading > .dc-icon-btn, .dc-scope-heading > .dc-grip { flex-shrink: 0; width: 18px; }
.dc-scope-toolbar { display: flex; gap: 6px; padding: 10px 0 2px; }
.dc-scope-toolbar .dc-btn { flex: 1; padding: 0 6px; min-width: 0; }
.dc-scope-group { margin-bottom: 8px; }
.dc-scope-group.dc-row-drop { box-shadow: inset 0 2px var(--dc-accent); }
.dc-scope-group.dc-row-dragging { opacity: .45; }
.dc-tree-empty { font-size: 11px; color: var(--dc-muted); padding: 10px 8px; }
.dc-sidebar-footer { margin-top: auto; padding: 18px 4px 0; display: flex; flex-direction: column; gap: 10px; }
.dc-sidebar-footer .dc-hint { font-size: 10px; }
.dc-breadcrumb-divider { margin: 0 8px; opacity: .5; }
.dc-kicker .dc-link { color: inherit; font-weight: 500; }
.dc-kicker .dc-link:disabled { cursor: default; text-decoration: none; }
.dc-panel-description { color: var(--dc-text-2); font-size: 12px; margin-bottom: 8px !important; }
.dc-card-head { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--dc-border); background: var(--dc-bg-subtle); }
.dc-card-head h4 { font-size: 15px; font-weight: 600; margin: 3px 0 6px; }
.dc-card-head .dc-kicker { font-size: 9px; }
.dc-settings-disclosure > summary { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; font-weight: 550; color: var(--dc-text-2); list-style: none; }
.dc-settings-disclosure > summary::-webkit-details-marker { display: none; }
.dc-settings-disclosure[open] > summary { margin-bottom: 16px; }
.dc-settings-disclosure > summary .dc-chevron { margin-left: auto; }
.dc-settings-disclosure[open] > summary .dc-chevron { transform: rotate(90deg); }
.dc[data-editable="false"] .dc-settings-disclosure > summary { display: none; }
.dc-settings-disclosure .dc-grid { padding: 16px; background: var(--dc-bg-subtle); border: 1px solid var(--dc-border); border-radius: var(--dc-radius-sm); }
.dc-model-list { display: grid; gap: 8px; }
.dc-model-card { display: flex; align-items: center; text-align: left; gap: 12px; padding: 16px; border: 1px solid var(--dc-border); border-radius: var(--dc-radius-sm); background: var(--dc-bg); color: var(--dc-text); cursor: pointer; }
.dc-model-card:hover { border-color: var(--dc-accent); background: var(--dc-bg-subtle); }
.dc-model-card > div { flex: 1; }
.dc-model-card .dc-panel-meta { margin-top: 6px; }
@container (max-width: 760px) {
  .dc-body { grid-template-columns: 190px minmax(0, 1fr); }
  .dc-main { padding: 18px 16px; }
  .dc-sidebar { padding: 8px 4px; }
  .dc-scope-heading .dc-nav > svg { display: none; }
  .dc-nav-group { margin-left: 14px; }
  .dc-panel-head > div:first-child { min-width: 0; }
}
@container (max-width: 520px) {
  .dc-body { display: flex; flex-direction: column; }
  .dc-sidebar { max-height: 190px; flex-shrink: 0; overflow: auto; border-right: 0; border-bottom: 1px solid var(--dc-border); }
  .dc-main { flex: 1; }
  .dc-toolbar-title { width: 100%; }
  .dc-sidebar-footer { margin-top: 0; }
}
@media print {
  .dc { height: auto !important; overflow: visible; border: 0; }
  .dc-sidebar, .dc-toolbar .dc-tabs, .dc-toolbar button { display: none; }
  .dc-body { display: block; overflow: visible !important; }
  .dc-main, .dc-scroll { overflow: visible; }
  .dc-card, .dc-table { break-inside: avoid; }
}
`;
