import { IS_PLATFORM } from '../../../constants/config';
import type { ShellIncomingMessage, ShellOutgoingMessage } from '../types/types';

export function getShellWebSocketUrl(backendUrl?: string, tokenKey?: string): string | null {
  let protocol: string;
  let host: string;
  if (backendUrl) {
    try {
      const parsed = new URL(backendUrl);
      host = parsed.host;
      protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    } catch {
      host = window.location.host;
      protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    }
  } else {
    host = window.location.host;
    protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
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