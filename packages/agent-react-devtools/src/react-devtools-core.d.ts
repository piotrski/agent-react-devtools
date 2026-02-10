declare module 'react-devtools-core' {
  export function initialize(): void;
  export function connectToDevTools(options: {
    port?: number;
    websocket?: WebSocket;
    host?: string;
  }): void;
}
