# DRef React domain composer

## Try the workspace

```sh
npm install
npm run play
```

Open the **Local** URL Vite prints (starts at `http://127.0.0.1:8400/`; an occupied port is skipped). Stop an older playground server with Ctrl+C before restarting. The playground imports the local source, React, and validator; it does not use a CDN. Source edits update automatically.

The preview is one dashboard workspace with light/dark, mapping-only, and read-only controls:

- Search the explorer for a scope or model. Use a scope's chevron to collapse its models.
- Drag a scope's six-dot handle to reorder it, or focus the handle and press Up / Down. The order is saved in the domain document; model membership remains unchanged.
- Select a scope to edit its description or browse its models.
- Select a model to work in **Fields**, **Mappings**, or **Settings**. Field ordering is also available.
- Set a field's type to a **model reference** (`#Model`) to link it to another model's key — a cross-model relationship. The composer offers the domain's models as `#Model` options and validates that the referenced model is declared.
- Use **Try validation** to load mapping errors; the status button opens the relevant view.
- Open **JSON** to inspect the result. The preview's Save button only marks the local state saved.

## Dashboard integration

```tsx
<DomainComposer
  initial={domain}
  height="100%"
  onChange={(draft, document) => updatePreview(document)}
  onSave={(document) => api.saveDomain(document)}
/>
```

Give the surrounding dashboard panel a definite height when using `height="100%"`. The explorer and workspace scroll independently. Narrow layouts respond to the component's container width.

`mode="mappings"` makes models and scopes fixed: the explorer selects models, the workspace edits incoming mappings, and the JSON tab becomes an export-only preview. `editable={false}` renders a printable document view.

### Theme tokens

The scoped stylesheet consumes the dashboard's `--bg-surface`, `--bg-sidebar`, `--bg-surface-subtle` / `--bg-surface-elevated`, `--bg-input`, `--border`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent` / `--brand`, `--font-sans`, `--font-mono`, and radius tokens. Status colors support `--status-healthy`, `--status-warning`, and `--status-danger`. Set `--text-on-accent` for bright accent buttons in dark themes. All have standalone fallbacks and can be overridden through `--dc-*` tokens.

## Verification

```sh
npm run build
npm test
npx playwright install chromium # first browser test run only
npm run test:browser
```

Browser tests cover local startup, scope drag/keyboard ordering, saved order and membership, explorer search, tabs and editing, field/mapping ordering, validation navigation, save state, read-only boundaries, and narrow layouts.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
