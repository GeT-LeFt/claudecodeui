import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Check, X, Server, Trash2, Plus } from 'lucide-react';

import { useBackend } from '../../../../contexts/BackendContext';
import type { BackendConfig } from '../../../../contexts/BackendContext';

export default function BackendSettingsTab() {
  const { t } = useTranslation('settings');
  const { backends, activeBackend, switchBackend, addBackend, removeBackend } = useBackend();
  const [testResults, setTestResults] = useState<Record<string, 'testing' | 'success' | 'failed'>>({});

  // Add backend form state
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [formError, setFormError] = useState('');

  const handleTest = async (backend: BackendConfig) => {
    const url = backend.url || '';
    setTestResults((prev) => ({ ...prev, [backend.id]: 'testing' }));
    try {
      const testUrl = url ? `${url}/api/auth/status` : '/api/auth/status';
      const res = await fetch(testUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
      setTestResults((prev) => ({ ...prev, [backend.id]: res.ok ? 'success' : 'failed' }));
    } catch {
      setTestResults((prev) => ({ ...prev, [backend.id]: 'failed' }));
    }
    setTimeout(() => {
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[backend.id];
        return next;
      });
    }, 3000);
  };

  const handleAdd = () => {
    const trimmedName = newName.trim();
    const trimmedUrl = newUrl.trim();
    if (!trimmedName) {
      setFormError(t('backends.noName'));
      return;
    }
    if (!trimmedUrl) {
      setFormError(t('backends.noUrl'));
      return;
    }
    addBackend(trimmedName, trimmedUrl);
    setNewName('');
    setNewUrl('');
    setFormError('');
  };

  const handleRemove = (backend: BackendConfig) => {
    if (window.confirm(t('backends.confirmRemove'))) {
      removeBackend(backend.id);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('backends.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('backends.description')}</p>
      </div>

      <div className="space-y-3">
        {backends.map((backend) => {
          const isActive = backend.id === activeBackend.id;
          const isPreset = backend.id === 'current' || backend.id === 'local';
          const testResult = testResults[backend.id];

          return (
            <div
              key={backend.id}
              className={`rounded-lg border p-4 transition-colors ${
                isActive ? 'border-primary/50 bg-primary/5' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-3">
                <Server className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{backend.name}</span>
                    {isActive && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {t('backends.active')}
                      </span>
                    )}
                    {isPreset && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t('backends.default')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground/70">
                    {backend.url || '(same-origin)'}
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {testResult === 'success' && <Check className="h-4 w-4 text-green-500" />}
                  {testResult === 'failed' && <X className="h-4 w-4 text-red-500" />}

                  <button
                    onClick={() => handleTest(backend)}
                    disabled={testResult === 'testing'}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    <Zap className="mr-1 inline h-3 w-3" />
                    {testResult === 'testing' ? t('backends.testing') : t('backends.testConnection')}
                  </button>

                  {!isActive && (
                    <button
                      onClick={() => switchBackend(backend.id)}
                      className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      {t('backends.switchTo')}
                    </button>
                  )}

                  {!isPreset && (
                    <button
                      onClick={() => handleRemove(backend)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                      title={t('backends.removeBackend')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add backend form */}
      <div className="rounded-lg border border-dashed border-border p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">{t('backends.addBackend')}</h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">{t('backends.name')}</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setFormError(''); }}
              placeholder={t('backends.namePlaceholder')}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex-[2]">
            <label className="mb-1 block text-xs text-muted-foreground">{t('backends.url')}</label>
            <input
              type="text"
              value={newUrl}
              onChange={(e) => { setNewUrl(e.target.value); setFormError(''); }}
              placeholder={t('backends.urlPlaceholder')}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAdd}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('backends.addBackend')}
            </button>
          </div>
        </div>
        {formError && (
          <p className="mt-2 text-xs text-red-500">{formError}</p>
        )}
      </div>
    </div>
  );
}
