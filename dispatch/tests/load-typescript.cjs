const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

module.exports = function createLoader(overrides = {}) {
  const cache = new Map()
  function load(file) {
    if (/^(app|lib|components)\//.test(file)) file = 'src/' + file
    file = path.resolve(root, file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name]
      if (name === 'server-only') return {}
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      if (name.startsWith('.') && name.endsWith('.json')) return require(path.resolve(path.dirname(file), name))
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'))
      return require(name)
    }
    new Function('module', 'exports', 'require', code)(module, module.exports, localRequire)
    return module.exports
  }
  return load
}
