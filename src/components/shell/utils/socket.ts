import { IS_PLATFORM } from '../../../constants/config';
import type { ShellIncomingMessage, ShellOutgoingMessage } from '../types/types';

export function getShellWebSocketUrl(backendUrl?: string, tokenKey?: string): string | null {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  let host: string;
  if (backendUrl) {
    try {
      const parsed = new URL(backendUrl);
      host = parsed.host;
    } catch {
      host = window.location.host;
    }
  } else {
    host = window.location.host;
  }

  if (IS_PLATFORM) {
    return `${protocol}//${host}/shell`;
  }

  const token = localStorage.getItem(tokenKey || 'auth-token');
  if (!token) {
    console.error('No authentication token found for Shell WebSocket connection');
    return null;
  }

  return `${protocol}//${host}/shell?token=${encodeURIComponent(token)}`;
}

export function parseShellMessage(payload: string): ShellIncomingMessage | null {
  try {
    return JSON.parse(payload) as ShellIncomingMessage;
  } catch {
    return null;
  }
}

export function sendSocketMessage(ws: WebSocket | null, message: ShellOutgoingMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}