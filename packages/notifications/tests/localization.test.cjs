const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const script = path.resolve(__dirname, '../scripts/localization.cjs');
const testOnMac = process.platform === 'darwin' ? test : test.skip;
testOnMac('sync preserves host translations and keys and is idempotent', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'webim-localization-'));
  try {
    fs.mkdirSync(path.join(directory, 'en.lproj'));
    const target = path.join(directory, 'en.lproj/Localizable.strings');
    fs.writeFileSync(target, '"HostKey" = "Host value";\n"P.OM" = "Custom %@: %@";\n');
    execFileSync(process.execPath, [script, directory, 'en', '--sync']);
    const first = fs.readFileSync(target, 'utf8');
    expect(first).toContain('"HostKey" = "Host value";');
    expect(first).toContain('"P.OM" = "Custom %@: %@";');
    execFileSync(process.execPath, [script, directory, 'en', '--sync']);
    expect(fs.readFileSync(target, 'utf8')).toBe(first);
    fs.writeFileSync(target, first.replace('Custom %@: %@', 'Wrong %@'));
    expect(() => execFileSync(process.execPath, [script, directory, 'en'], { stdio: 'pipe' })).toThrow();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});