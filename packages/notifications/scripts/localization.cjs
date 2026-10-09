const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const [directory, locale, flag] = process.argv.slice(2);
if (!directory || !['en', 'ru'].includes(locale) || (flag && flag !== '--sync')) {
  console.error('Usage: node scripts/localization.cjs <host-resource-directory> <en|ru> [--sync]');
  process.exit(1);
}
if (process.platform !== 'darwin') {
  console.error('This validator uses Apple plutil and must run on macOS. Copy templates manually on other hosts.');
  process.exit(1);
}
function parse(filename) {
  return JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', filename], { encoding: 'utf8' }));
}
try {
  const defaults = parse(path.resolve(__dirname, '../resources', `${locale}.lproj/Localizable.strings`));
  const target = path.resolve(directory, `${locale}.lproj/Localizable.strings`);
  const existing = fs.existsSync(target) ? parse(target) : {};
  const missing = Object.keys(defaults).filter((key) => !Object.prototype.hasOwnProperty.call(existing, key));
  if (flag === '--sync' && missing.length) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const additions = missing.map((key) => `${JSON.stringify(key)} = ${JSON.stringify(defaults[key])};`).join('\n');
    fs.appendFileSync(target, `\n${additions}\n`, 'utf8');
  }
  const values = flag === '--sync' ? parse(target) : existing;
  const arity = { 'P.OM': 2, 'P.OF': 2, 'P.OA': 1, 'P.CR': 0, 'P.WM': 0 };
  let invalid = false;
  for (const key of Object.keys(defaults)) {
    if (typeof values[key] !== 'string') {
      console.error(`Missing localization: ${locale}/${key}`);
      invalid = true;
    } else if (arity[key] !== undefined) {
      const formats = values[key].replace(/%%/g, '').match(/%(?:\d+\$)?@/g) ?? [];
      if (formats.length !== arity[key]) {
        console.error(`Argument mismatch: ${locale}/${key} expects ${arity[key]} object placeholders`);
        invalid = true;
      }
    }
  }
  console.log('P.RO uses an argument-free fallback; verify its copy/arguments with your Webim server.');
  if (invalid) process.exitCode = 1;
  else console.log(`Validated ${locale} Webim main-bundle localization keys.`);
} catch {
  console.error('Unable to parse localization resources with plutil. No existing keys were overwritten.');
  process.exitCode = 1;
}