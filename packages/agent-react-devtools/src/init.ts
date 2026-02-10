import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

type Framework = 'vite' | 'nextjs' | 'cra' | 'react-native' | 'unknown';

export function detectFramework(cwd: string): Framework {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return 'unknown';

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  if (allDeps['@vitejs/plugin-react']) return 'vite';
  if (allDeps['next']) return 'nextjs';
  if (allDeps['react-scripts']) return 'cra';
  if (allDeps['react-native']) return 'react-native';
  return 'unknown';
}

function findFile(cwd: string, ...candidates: string[]): string | null {
  for (const c of candidates) {
    const p = join(cwd, c);
    if (existsSync(p)) return p;
  }
  return null;
}

function prependImport(filePath: string, importLine: string, dryRun: boolean): string | null {
  const content = readFileSync(filePath, 'utf-8');
  if (content.includes('agent-react-devtools')) {
    return null; // already configured
  }
  const newContent = importLine + '\n' + content;
  if (!dryRun) {
    writeFileSync(filePath, newContent, 'utf-8');
  }
  return filePath;
}

function patchViteConfig(cwd: string, dryRun: boolean): string[] {
  const configPath = findFile(
    cwd,
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mts',
    'vite.config.mjs',
  );
  if (!configPath) {
    console.error('  Could not find vite.config.{ts,js}');
    return [];
  }

  const content = readFileSync(configPath, 'utf-8');
  if (content.includes('agent-react-devtools')) {
    console.log('  Already configured');
    return [];
  }

  const importLine = "import { reactDevtools } from 'agent-react-devtools/vite';";
  let newContent: string;

  // Add import after the last existing import
  const lastImportIdx = content.lastIndexOf('\nimport ');
  if (lastImportIdx !== -1) {
    const endOfLine = content.indexOf('\n', lastImportIdx + 1);
    newContent =
      content.slice(0, endOfLine + 1) +
      importLine +
      '\n' +
      content.slice(endOfLine + 1);
  } else {
    newContent = importLine + '\n' + content;
  }

  // Add reactDevtools() to plugins array
  const pluginsMatch = newContent.match(/plugins\s*:\s*\[/);
  if (pluginsMatch && pluginsMatch.index != null) {
    const insertPos = pluginsMatch.index + pluginsMatch[0].length;
    newContent =
      newContent.slice(0, insertPos) +
      '\n    reactDevtools(),' +
      newContent.slice(insertPos);
  } else {
    console.error('  Could not find plugins array in vite config');
    return [];
  }

  if (!dryRun) {
    writeFileSync(configPath, newContent, 'utf-8');
  }

  return [configPath];
}

function patchNextJs(cwd: string, dryRun: boolean): string[] {
  const entryPath = findFile(
    cwd,
    'app/layout.tsx',
    'app/layout.jsx',
    'app/layout.js',
    'pages/_app.tsx',
    'pages/_app.jsx',
    'pages/_app.js',
    'src/app/layout.tsx',
    'src/app/layout.jsx',
    'src/pages/_app.tsx',
    'src/pages/_app.jsx',
  );
  if (!entryPath) {
    console.error('  Could not find app/layout.tsx or pages/_app.tsx');
    return [];
  }

  const result = prependImport(
    entryPath,
    "import 'agent-react-devtools/connect';",
    dryRun,
  );
  return result ? [result] : [];
}

function patchCRA(cwd: string, dryRun: boolean): string[] {
  const entryPath = findFile(
    cwd,
    'src/index.tsx',
    'src/index.jsx',
    'src/index.js',
  );
  if (!entryPath) {
    console.error('  Could not find src/index.tsx');
    return [];
  }

  const result = prependImport(
    entryPath,
    "import 'agent-react-devtools/connect';",
    dryRun,
  );
  return result ? [result] : [];
}

export async function runInit(
  cwd: string,
  dryRun: boolean,
): Promise<void> {
  const framework = detectFramework(cwd);

  console.log(`Detected framework: ${framework}`);

  if (framework === 'unknown') {
    console.log('\nCould not detect framework. Manual setup required:');
    console.log("  import 'agent-react-devtools/connect';");
    console.log('  // Must be imported before React loads');
    return;
  }

  if (framework === 'react-native') {
    console.log('\nReact Native detected — no code changes needed!');
    console.log('React Native apps connect to DevTools automatically.\n');
    console.log('Next steps:');
    console.log('  1. Start the daemon: agent-react-devtools start');
    console.log('  2. Start your app: npx react-native start');
    console.log('\nFor physical devices:');
    console.log('  adb reverse tcp:8097 tcp:8097');
    console.log('\nFor Expo:');
    console.log('  The connection works automatically with Expo dev client.');
    console.log('\nCustom port:');
    console.log('  Set REACT_DEVTOOLS_PORT=<port> environment variable');
    return;
  }

  let modified: string[] = [];

  if (dryRun) {
    console.log('\n[dry-run] Would modify:');
  }

  switch (framework) {
    case 'vite':
      modified = patchViteConfig(cwd, dryRun);
      break;
    case 'nextjs':
      modified = patchNextJs(cwd, dryRun);
      break;
    case 'cra':
      modified = patchCRA(cwd, dryRun);
      break;
  }

  if (modified.length === 0 && !dryRun) {
    console.log('  No changes needed (already configured or could not find entry files)');
    return;
  }

  for (const f of modified) {
    console.log(`  ${dryRun ? '[dry-run] ' : ''}Modified: ${f}`);
  }

  console.log('\nNext steps:');
  if (framework === 'vite') {
    console.log('  1. Install: npm install -D agent-react-devtools react-devtools-core');
  } else {
    console.log('  1. Install: npm install -D agent-react-devtools');
  }
  console.log('  2. Start daemon: agent-react-devtools start');
  console.log('  3. Start dev server and open your app');
  console.log('  4. Inspect: agent-react-devtools get tree');
}
