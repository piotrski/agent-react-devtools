import { describe, it, expect } from 'vitest';

// Inline the parseArgs function for testing (it's not exported from cli.ts)
function parseArgs(argv: string[]): {
  command: string[];
  flags: Record<string, string | boolean>;
} {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const eqIdx = key.indexOf('=');
      if (eqIdx !== -1) {
        flags[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      command.push(arg);
    }
  }
  return { command, flags };
}

describe('CLI argument parser', () => {
  it('should parse simple commands', () => {
    const { command, flags } = parseArgs(['start']);
    expect(command).toEqual(['start']);
    expect(flags).toEqual({});
  });

  it('should parse commands with subcommands', () => {
    const { command } = parseArgs(['get', 'tree']);
    expect(command).toEqual(['get', 'tree']);
  });

  it('should parse --flag=value', () => {
    const { flags } = parseArgs(['start', '--port=8098']);
    expect(flags['port']).toBe('8098');
  });

  it('should parse --flag value', () => {
    const { flags } = parseArgs(['start', '--port', '8098']);
    expect(flags['port']).toBe('8098');
  });

  it('should parse boolean flags', () => {
    const { flags } = parseArgs(['find', 'User', '--exact']);
    expect(flags['exact']).toBe(true);
  });

  it('should parse mixed args', () => {
    const { command, flags } = parseArgs([
      'profile',
      'slow',
      '--limit',
      '5',
    ]);
    expect(command).toEqual(['profile', 'slow']);
    expect(flags['limit']).toBe('5');
  });

  it('should parse component id as positional arg', () => {
    const { command } = parseArgs(['get', 'component', '42']);
    expect(command).toEqual(['get', 'component', '42']);
  });
});
