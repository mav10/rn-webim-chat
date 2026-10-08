const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const typescript = require('typescript');
const root = path.resolve(__dirname, '..');
const compiler = require.resolve('typescript/bin/tsc');
const verify = process.argv.includes('--verify-core');
const guide = path.resolve(root, '../../doc/notifications.md');
if (fs.existsSync(guide)) {
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.copyFileSync(guide, path.join(root, 'docs/notifications.md'));
}
if (verify) {
  execFileSync(process.execPath, [compiler, path.resolve(root, '../../src/notifications.ts'),
    '--ignoreConfig', '--outDir', '.core-contract', '--declaration', '--strict', '--skipLibCheck',
    '--target', 'ES2020', '--module', 'CommonJS', '--types', 'react', '--ignoreDeprecations', '6.0'],
  { cwd: root, stdio: 'inherit' });
}
execFileSync(process.execPath, [compiler, '-p', verify ? 'tsconfig.verify.json' : 'tsconfig.build.json'],
  { cwd: root, stdio: 'inherit' });
for (const file of fs.readdirSync(path.join(root, 'lib'))) {
  if (!file.endsWith('.js')) continue;
  const filename = path.join(root, 'lib', file);
  fs.writeFileSync(filename, typescript.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText);
}