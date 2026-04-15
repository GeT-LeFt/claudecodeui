import { useState, useRef, useEffect } from 'react';
import { Server, ChevronDown, Check } from 'lucide-react';
import { useBackend } from '../../../../contexts/BackendContext';

export default function BackendSwitcher() {
  const { backends, activeBackend, switchBackend } = useBackend();
  const [isOpen, setIsOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'reachable' | 'unreachable'>('checking');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Health check when active backend changes
  useEffect(() => {
    let cancelled = false;
    setBackendStatus('checking');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const healthUrl = activeBackend.url ? `${activeBackend.url}/health` : '/health';
    fetch(healthUrl, { method: 'GET', signal: controller.signal })
      .then((res) => {
        if (!cancelled) setBackendStatus(res.ok ? 'reachable' : 'unreachable');
      })
      .catch(() => {
        if (!cancelled) setBackendStatus('unreachable');
      })
      .finally(() => clearTimeout(timeoutId));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [activeBackend.id]);

  const statusColor =
    backendStatus === 'checking' ? 'bg-gray-400' :
    backendStatus === 'reachable' ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Server className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 truncate text-left text-sm">
          {activeBackend.name}
        </span>
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusColor}`} />
        <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-full min-w-[200px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="py-1">
            {backends.map((backend) => (
              <button
                key={backend.id}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60 ${
                  backend.id === activeBackend.id ? 'text-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => {
                  switchBackend(backend.id);
                  setIsOpen(false);
                }}
              >
                <span className="flex-1 truncate">
                  {backend.name}
                </span>
                {backend.id === activeBackend.id && (
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
