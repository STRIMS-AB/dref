import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DomainComposer } from '../src/index';
import type { ComposerMode, DomainDocument } from '../src/index';
import './style.css';

const sample: DomainDocument = {
  name: 'Commerce', version: '1.2.0', description: 'Products, stock and partner integrations.',
  scopes: [
    { name: 'catalog', description: 'Product definitions and pricing.' },
    { name: 'inventory', description: 'Stock levels and warehouse capacity.' },
    { name: 'partners', description: 'External suppliers and integrations.' },
  ],
  models: [
    { name: 'Product', scope: 'catalog', authority: 'internal', description: 'The canonical product record shared by your storefront and fulfilment services.',
      properties: [
        { name: 'id', type: 'String', required: true, key: true },
        { name: 'sku', type: 'String', required: true, constraints: [{ type: 'notEmpty' }] },
        { name: 'name', type: 'String', required: true },
        { name: 'price', type: 'Number', constraints: [{ type: 'positive' }] },
        { name: 'tags', type: 'String', list: true },
      ],
      mapsFrom: [{ name: 'ERPProduct', provider: 'ERP', version: '2026-01', description: 'Normalize product records from the upstream catalogue.',
        fields: [{ from: 'product_id', to: 'id' }, { from: 'item_code', to: 'sku', transform: [{ type: 'trim' }] }, { from: 'unit_price', to: 'price', transform: [{ type: 'toNumber' }] }],
      }],
    },
    { name: 'Category', scope: 'catalog', properties: [{ name: 'id', type: 'String', key: true }, { name: 'name', type: 'String' }] },
    { name: 'Warehouse', scope: 'inventory', properties: [{ name: 'id', type: 'String', key: true }, { name: 'capacity', type: 'Number' }] },
    { name: 'Supplier', scope: 'partners', properties: [{ name: 'id', type: 'String', key: true }, { name: 'email', type: 'String', constraints: [{ type: 'email' }] }] },
  ],
};

function Playground() {
  const [mode, setMode] = useState<ComposerMode>('full');
  const [dark, setDark] = useState(false);
  const [editable, setEditable] = useState(true);
  const [revision, setRevision] = useState(0);
  const [initial, setInitial] = useState(sample);
  const [message, setMessage] = useState('Ready · Changes are local to this preview');
  return <div className="studio" data-theme={dark ? 'dark' : 'light'}>
    <header className="studio-header">
      <div className="studio-logo">dref<span>/</span></div>
      <div className="studio-heading"><span>WORKSPACE / COMMERCE</span><h1>Domain studio</h1></div>
      <div className="studio-controls">
        <label>Workspace<select aria-label="Workspace mode" value={mode} onChange={(e) => setMode(e.target.value as ComposerMode)}><option value="full">Domain designer</option><option value="mappings">Mappings only</option></select></label>
        <label className="studio-check"><input type="checkbox" checked={!editable} onChange={(e) => setEditable(!e.target.checked)} />Read only</label>
        <button onClick={() => setDark(!dark)}>{dark ? 'Light theme' : 'Dark theme'}</button>
      </div>
    </header>
    <div className="studio-context"><span>Design your domain. Organize scopes on the left; define each model in the workspace.</span>
      <div><button onClick={() => { setInitial(sample); setRevision(revision + 1); setMessage('Sample restored'); }}>Reset sample</button>
      <button onClick={() => { setInitial({ ...sample, models: [{ ...sample.models![0], mapsFrom: [{ name: '', fields: [{ from: '' }] }] }] }); setRevision(revision + 1); }}>Try validation</button></div>
    </div>
    <main className="studio-workspace">
      <DomainComposer key={revision} initial={initial} editable={editable} mode={mode} height="100%"
        onChange={(_, doc) => setMessage(`Edited · ${doc.models?.length ?? 0} models · Scopes: ${doc.scopes?.map((s) => s.name).join(', ')}`)}
        onSave={() => { setMessage('Saved locally for this preview'); }} />
    </main>
    <footer className="studio-footer"><span role="status">{message}</span><span>Scope handles: drag or ↑ / ↓ · JSON: ⌘ / Ctrl + Enter</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Playground />);
