import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFramework, runInit } from '../init.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ard-test-'));
}

describe('detectFramework', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects Vite via @vitejs/plugin-react', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { '@vitejs/plugin-react': '^4.0.0' } }),
    );
    expect(detectFramework(dir)).toBe('vite');
  });

  it('detects Next.js', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } }),
    );
    expect(detectFramework(dir)).toBe('nextjs');
  });

  it('detects CRA via react-scripts', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { 'react-scripts': '^5.0.0' } }),
    );
    expect(detectFramework(dir)).toBe('cra');
  });

  it('detects React Native', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { 'react-native': '^0.72.0' } }),
    );
    expect(detectFramework(dir)).toBe('react-native');
  });

  it('returns unknown when no framework detected', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    expect(detectFramework(dir)).toBe('unknown');
  });

  it('returns unknown when no package.json', () => {
    expect(detectFramework(dir)).toBe('unknown');
  });
});

describe('runInit', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('patches vite.config.ts with plugin import and usage', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { '@vitejs/plugin-react': '^4.0.0' } }),
    );
    writeFileSync(
      join(dir, 'vite.config.ts'),
      `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`,
    );

    await runInit(dir, false);

    const content = readFileSync(join(dir, 'vite.config.ts'), 'utf-8');
    expect(content).toContain("import { reactDevtools } from 'agent-react-devtools/vite'");
    expect(content).toContain('reactDevtools(),');
  });

  it('dry-run does not modify files', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { '@vitejs/plugin-react': '^4.0.0' } }),
    );
    const original = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`;
    writeFileSync(join(dir, 'vite.config.ts'), original);

    await runInit(dir, true);

    const content = readFileSync(join(dir, 'vite.config.ts'), 'utf-8');
    expect(content).toBe(original);
  });

  it('patches Next.js app/layout.tsx', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^14.0.0' } }),
    );
    mkdirSync(join(dir, 'app'));
    writeFileSync(
      join(dir, 'app/layout.tsx'),
      `export default function Layout({ children }) {\n  return <html><body>{children}</body></html>;\n}\n`,
    );

    await runInit(dir, false);

    const content = readFileSync(join(dir, 'app/layout.tsx'), 'utf-8');
    expect(content).toMatch(/^import 'agent-react-devtools\/connect'/);
  });

  it('patches CRA src/index.tsx', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { 'react-scripts': '^5.0.0' } }),
    );
    mkdirSync(join(dir, 'src'));
    writeFileSync(
      join(dir, 'src/index.tsx'),
      `import React from 'react';\nimport ReactDOM from 'react-dom/client';\n`,
    );

    await runInit(dir, false);

    const content = readFileSync(join(dir, 'src/index.tsx'), 'utf-8');
    expect(content).toMatch(/^import 'agent-react-devtools\/connect'/);
  });

  it('skips if already configured', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { '@vitejs/plugin-react': '^4.0.0' } }),
    );
    const original = `import { reactDevtools } from 'agent-react-devtools/vite';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({\n  plugins: [reactDevtools(), react()],\n});\n`;
    writeFileSync(join(dir, 'vite.config.ts'), original);

    await runInit(dir, false);

    const content = readFileSync(join(dir, 'vite.config.ts'), 'utf-8');
    expect(content).toBe(original);
  });
});
