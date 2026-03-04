import type { Plugin, HtmlTagDescriptor } from 'vite';

export interface ReactDevtoolsOptions {
  /** WebSocket port the daemon listens on. Default: 8097 */
  port?: number;
  /** WebSocket host. Default: 'localhost' */
  host?: string;
}

export function reactDevtools(options?: ReactDevtoolsOptions): Plugin {
  const port = options?.port ?? 8097;
  const host = options?.host ?? 'localhost';

  return {
    name: 'agent-react-devtools',
    apply: 'serve',
    config() {
      // The connect module is injected via transformIndexHtml, so Vite's
      // dep scanner won't discover react-devtools-core (a CJS package)
      // until the page loads. Without this hint, Vite triggers dep
      // re-optimization at runtime which causes a full-reload and breaks HMR.
      return {
        optimizeDeps: {
          include: ['react-devtools-core'],
        },
      };
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        const tags: HtmlTagDescriptor[] = [];

        if (host !== 'localhost') {
          tags.push({
            tag: 'meta',
            attrs: { name: 'agent-react-devtools-host', content: host },
            injectTo: 'head-prepend',
          });
        }

        if (port !== 8097) {
          tags.push({
            tag: 'meta',
            attrs: { name: 'agent-react-devtools-port', content: String(port) },
            injectTo: 'head-prepend',
          });
        }

        tags.push({
          tag: 'script',
          attrs: { type: 'module' },
          children: `import 'agent-react-devtools/connect';`,
          injectTo: 'head-prepend',
        });

        return tags;
      },
    },
  };
}
