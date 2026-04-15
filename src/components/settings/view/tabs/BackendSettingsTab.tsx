import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Check, X, Server } from 'lucide-react';
import { useBackend } from '../../../../contexts/BackendContext';
import type { BackendConfig } from '../../../../contexts/BackendContext';

export default function BackendSettingsTab() {
  const { t } = useTranslation('settings');
  const { backends, activeBackend, switchBackend } = useBackend();
  const [testResults, setTestResults] = useState<Record<string, 'testing' | 'success' | 'failed'>>({});

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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('backends.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('backends.description')}</p>
      </div>

      <div className="space-y-3">
        {backends.map((backend) => {
          const isActive = backend.id === activeBackend.id;
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
                  </div>
                  <div className="text-xs text-muted-foreground/70">
                    {backend.url}
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
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
