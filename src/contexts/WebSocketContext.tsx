import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../components/auth/context/AuthContext';
import { useBackend } from './BackendContext';
import { IS_PLATFORM } from '../constants/config';

type WebSocketContextType = {
  ws: WebSocket | null;
  sendMessage: (message: any) => void;
  latestMessage: any | null;
  isConnected: boolean;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

const buildWebSocketUrl = (token: string | null, backendUrl?: string) => {
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
  if (IS_PLATFORM) return `${protocol}//${host}/ws`;
  if (!token) return null;
  return `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;
};

const useWebSocketProviderState = (): WebSocketContextType => {
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});
  const generationRef = useRef(0);
  const [latestMessage, setLatestMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  // L6: Reactive WebSocket state — useMemo can't detect ref mutations, so we use state
  // to ensure the context value updates when the socket instance changes.
  const [wsInstance, setWsInstance] = useState<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(1000);
  const { token } = useAuth();
  const { activeBackend } = useBackend();
  const backendUrl = activeBackend.url;

  const MAX_RECONNECT_DELAY = 30000;

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    try {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setWsInstance(null);
      }

      // L5: Reset hasConnectedRef on new connection so that a backend switch
      // doesn't incorrectly emit a "websocket-reconnected" message on first open.
      hasConnectedRef.current = false;

      const generation = ++generationRef.current;
      const wsUrl = buildWebSocketUrl(token, backendUrl);

      if (!wsUrl) return console.warn('No authentication token found for WebSocket connection');

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        if (generation !== generationRef.current) { websocket.close(); return; }
        reconnectDelayRef.current = 1000;
        setIsConnected(true);
        wsRef.current = websocket;
        setWsInstance(websocket);
        if (hasConnectedRef.current) {
          setLatestMessage({ type: 'websocket-reconnected', timestamp: Date.now() });
        }
        hasConnectedRef.current = true;
      };

      websocket.onmessage = (event) => {
        if (generation !== generationRef.current) return;
        try {
          const data = JSON.parse(event.data);
          setLatestMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        if (generation !== generationRef.current) return;
        setIsConnected(false);
        wsRef.current = null;
        setWsInstance(null);

        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (unmountedRef.current || generation !== generationRef.current) return;
          connectRef.current();
        }, delay);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, [token, backendUrl]);

  connectRef.current = connect;

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: any) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }, []);

  // L6: Use wsInstance (state) instead of wsRef.current so the memo recomputes
  // when the WebSocket instance changes — ref mutations don't trigger React re-renders.
  const value: WebSocketContextType = useMemo(() =>
  ({
    ws: wsInstance,
    sendMessage,
    latestMessage,
    isConnected
  }), [wsInstance, sendMessage, latestMessage, isConnected]);

  return value;
};

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const webSocketData = useWebSocketProviderState();

  return (
    <WebSocketContext.Provider value={webSocketData}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketContext;
