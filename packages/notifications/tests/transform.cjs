const typescript = require('typescript');
module.exports = {
  process(source, filename) {
    return { code: typescript.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText };
  },
};