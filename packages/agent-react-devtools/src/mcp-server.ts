import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ensureDaemon, sendCommand } from './daemon-client.js';
import {
  formatTree,
  formatComponent,
  formatSearchResults,
  formatCount,
  formatProfileSummary,
  formatProfileReport,
  formatSlowest,
  formatRerenders,
  formatTimeline,
} from './formatters.js';

export async function startMcpServer(): Promise<void> {
  // Ensure daemon is running before starting MCP server
  await ensureDaemon();

  const server = new McpServer({
    name: 'agent-react-devtools',
    version: '0.1.0',
  });

  // ── Component Tree ──

  server.tool(
    'react_get_component_tree',
    'Get the React component hierarchy tree',
    { depth: z.number().optional().describe('Maximum tree depth') },
    async ({ depth }) => {
      const resp = await sendCommand({ type: 'get-tree', depth });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatTree(resp.data as any) }] };
    },
  );

  server.tool(
    'react_inspect_component',
    'Inspect a component — returns props, state, and hooks',
    { id: z.union([z.string(), z.number()]).describe('Component label (e.g. "@c1") or numeric ID') },
    async ({ id }) => {
      const resp = await sendCommand({ type: 'get-component', id });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatComponent(resp.data as any, resp.label) }] };
    },
  );

  server.tool(
    'react_find_components_by_name',
    'Search for components by display name',
    {
      name: z.string().describe('Component name to search for'),
      exact: z.boolean().optional().describe('Exact match (default: partial)'),
    },
    async ({ name, exact }) => {
      const resp = await sendCommand({ type: 'find', name, exact });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatSearchResults(resp.data as any) }] };
    },
  );

  server.tool(
    'react_get_component_count',
    'Get total component count broken down by type',
    {},
    async () => {
      const resp = await sendCommand({ type: 'count' });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatCount(resp.data as any) }] };
    },
  );

  // ── Profiling ──

  server.tool(
    'react_profile_start',
    'Start a React profiling session to record render performance',
    { name: z.string().optional().describe('Session name') },
    async ({ name }) => {
      const resp = await sendCommand({ type: 'profile-start', name });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: String(resp.data) }] };
    },
  );

  server.tool(
    'react_profile_stop',
    'Stop the active profiling session and collect data',
    {},
    async () => {
      const resp = await sendCommand({ type: 'profile-stop' });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatProfileSummary(resp.data as any) }] };
    },
  );

  server.tool(
    'react_profile_report',
    'Get a render report for a specific component',
    { componentId: z.union([z.string(), z.number()]).describe('Component label (e.g. "@c1") or numeric ID') },
    async ({ componentId }) => {
      const resp = await sendCommand({ type: 'profile-report', componentId });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatProfileReport(resp.data as any, resp.label) }] };
    },
  );

  server.tool(
    'react_profile_slowest',
    'List the slowest-rendering components (by average render time)',
    { limit: z.number().optional().describe('Max results (default 10)') },
    async ({ limit }) => {
      const resp = await sendCommand({ type: 'profile-slow', limit });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatSlowest(resp.data as any) }] };
    },
  );

  server.tool(
    'react_profile_rerenders',
    'List the most re-rendered components',
    { limit: z.number().optional().describe('Max results (default 10)') },
    async ({ limit }) => {
      const resp = await sendCommand({ type: 'profile-rerenders', limit });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatRerenders(resp.data as any) }] };
    },
  );

  server.tool(
    'react_profile_timeline',
    'Get a timeline of commit durations',
    { limit: z.number().optional().describe('Max entries') },
    async ({ limit }) => {
      const resp = await sendCommand({ type: 'profile-timeline', limit });
      if (!resp.ok) return { content: [{ type: 'text' as const, text: `Error: ${resp.error}` }] };
      return { content: [{ type: 'text' as const, text: formatTimeline(resp.data as any) }] };
    },
  );

  // ── Start server ──

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
