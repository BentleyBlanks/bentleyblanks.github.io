// Pages selects a separately stamped menu or game bundle; development keeps the import map.
// Game bundle keeps Script_BrowserBundle.mjs as one zero-waterfall file while splitting
// on-demand sandbox/test-range plugins (Script_SandboxPlugin_*.mjs except EncounterPlay) into
// independent Script_BundleChunk_*.mjs files that share main-bundle singletons via __txBundleMods.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_PLUGIN_RE = /^\.\/Script_SandboxPlugin_[A-Za-z0-9_]+\.mjs$/;
const IsSplitSandboxPlugin = (spec) => SANDBOX_PLUGIN_RE.test(spec) && spec !== './Script_SandboxPlugin_EncounterPlay.mjs';
const NormRel = (base, abs) => path.relative(base, abs).replace(/\\/g, '/');
// Developer tools (advanced tools + debug overlays) are reachable only through these two
// boundary modules; stripping swaps each for its stub and leaves every other import intact.
export const DEV_TOOL_STUBS = Object.freeze({
  './Script_DevTools.mjs': './Script_DevToolsStub.mjs',
  './Data_DevTools.mjs': './Data_DevToolsStub.mjs',
});
// Tools already moved into AdvancedTools/ (Script_DevToolsSplit / Data_DevToolsSplit) are never published:
// the Pages build always swaps this pair for its stubs and the staging copy has no AdvancedTools/ directory.
export const SPLIT_TOOL_STUBS = Object.freeze({
  './Script_ArchivedP012Split.mjs': './Script_ArchivedP012SplitStub.mjs',
  './Script_EncounterPlaySplit.mjs': './Script_EncounterPlaySplitStub.mjs',
  './Script_DevToolsSplit.mjs': './Script_DevToolsSplitStub.mjs',
  './Data_DevToolsSplit.mjs': './Data_DevToolsSplitStub.mjs',
});
function StripDevToolsPlugin(projectDir, stubs) {
  return {name: 'strip-dev-tools', setup(builder) {
    builder.onResolve({filter: /^\.\/(?:(?:Script|Data)_DevTools(?:Split)?|Script_EncounterPlaySplit|Script_ArchivedP012Split)\.mjs$/}, args => (stubs[args.path] ? {path: path.join(projectDir, stubs[args.path])} : undefined));
  }};
}
export async function BuildBrowserBundle(projectDir = path.dirname(fileURLToPath(import.meta.url)), {stripDevTools = false, stripSplitTools = false} = {}) {
  const stubs = {...(stripSplitTools || stripDevTools ? SPLIT_TOOL_STUBS : {}), ...(stripDevTools ? DEV_TOOL_STUBS : {})};
  const basePlugins = Object.keys(stubs).length ? [StripDevToolsPlugin(projectDir, stubs)] : [];
  const sourceHtml = await fs.readFile(path.join(projectDir, 'index.html'), 'utf8');
  const mapMatch = sourceHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!mapMatch) throw new Error('Source import map is missing');
  const imports = JSON.parse(mapMatch[1]).imports;
  const bundleName = 'Script_BrowserBundle.mjs';

  // Pass 1: probe main game graph with on-demand sandbox plugins externalized.
  const splitPluginSpecifiers = new Set();
  const mainProbe = await build({
    absWorkingDir: projectDir,
    entryPoints: ['Script_Main.mjs'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    metafile: true,
    external: ['three', './vendor/*'],
    logLevel: 'silent',
    plugins: [...basePlugins, {name: 'externalize-sandbox-plugins', setup(builder) {
      builder.onResolve({filter: SANDBOX_PLUGIN_RE}, args => {
        if (!IsSplitSandboxPlugin(args.path)) return undefined;
        splitPluginSpecifiers.add(args.path);
        return {path: args.path, external: true};
      });
    }}],
  });
  const mainInputs = new Set(Object.keys(mainProbe.metafile.inputs).map(p => p.replace(/\\/g, '/')));
  const pluginSpecs = [...splitPluginSpecifiers].sort();

  // Pass 2a: discover which modules already inside Script_BrowserBundle.mjs are imported by split plugins.
  const sharedModules = new Set();
  const ResolveRelativeWithStub = (args) => {
    if (args.path.startsWith('./vendor/')) return null;
    if (stubs[args.path]) return NormRel(projectDir, path.join(projectDir, stubs[args.path]));
    return NormRel(projectDir, path.resolve(args.resolveDir, args.path));
  };
  if (pluginSpecs.length) {
    await build({
      absWorkingDir: projectDir,
      entryPoints: pluginSpecs.map(spec => spec.slice(2)),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      outdir: projectDir,
      write: false,
      metafile: true,
      external: ['three', './vendor/*'],
      logLevel: 'silent',
      plugins: [{name: 'find-shared-modules', setup(builder) {
        builder.onResolve({filter: /^\./}, args => {
          const rel = ResolveRelativeWithStub(args);
          if (!rel) return undefined;
          if (mainInputs.has(rel)) {
            sharedModules.add(rel);
            return {path: rel, external: true};
          }
          if (stubs[args.path]) return {path: path.join(projectDir, stubs[args.path])};
          return undefined;
        });
      }}],
    });
  }

  // Pass 2b: collect exact ESM export names for every shared module via esbuild metafile.
  const sharedList = [...sharedModules].sort();
  const sharedExports = new Map();
  if (sharedList.length) {
    const expBuild = await build({
      absWorkingDir: projectDir,
      entryPoints: Object.fromEntries(sharedList.map((rel, i) => ['__shared_' + i, rel])),
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      outdir: projectDir,
      write: false,
      metafile: true,
      external: ['three', './vendor/*'],
      logLevel: 'silent',
      plugins: basePlugins,
    });
    for (const meta of Object.values(expBuild.metafile.outputs)) {
      if (!meta.entryPoint) continue;
      sharedExports.set(meta.entryPoint.replace(/\\/g, '/'), meta.exports);
    }
  }

  // Pass 2c: bundle each split sandbox plugin into its own independent content-hashed chunk,
  // reading main-bundle singletons from globalThis.__txBundleMods.
  const chunkFiles = [];
  const chunkUrlBySpec = new Map();
  const chunkInputs = new Set();
  const chunkOutputImports = [];
  if (pluginSpecs.length) {
    const chunkBuild = await build({
      absWorkingDir: projectDir,
      entryPoints: Object.fromEntries(pluginSpecs.map(spec => [spec.slice(2, -4), spec.slice(2)])),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      outdir: projectDir,
      outExtension: {'.js': '.mjs'},
      write: false,
      metafile: true,
      external: ['three', './vendor/*'],
      minify: true,
      keepNames: true,
      legalComments: 'inline',
      charset: 'utf8',
      logLevel: 'silent',
      plugins: [{name: 'proxy-shared-modules', setup(builder) {
        builder.onResolve({filter: /^\./}, args => {
          const rel = ResolveRelativeWithStub(args);
          if (!rel) return undefined;
          if (sharedExports.has(rel)) return {path: rel, namespace: 'tx-shared-proxy'};
          if (stubs[args.path]) return {path: path.join(projectDir, stubs[args.path])};
          return undefined;
        });
        builder.onLoad({filter: /.*/, namespace: 'tx-shared-proxy'}, args => {
          const exportsList = sharedExports.get(args.path) || [];
          const lines = [`const __m=globalThis.__txBundleMods[${JSON.stringify(args.path)}];`];
          let idx = 0;
          for (const name of exportsList) {
            if (name === 'default') lines.push('export default __m.default;');
            else {
              const local = '__e' + (idx++);
              lines.push(`const ${local}=__m[${JSON.stringify(name)}];export{${local} as ${name}};`);
            }
          }
          return {contents: lines.join('\n'), loader: 'js'};
        });
      }}],
    });
    for (const file of chunkBuild.outputFiles) {
      const stem = path.basename(file.path, '.mjs');
      const spec = './' + stem + '.mjs';
      const hash = createHash('sha256').update(file.text).digest('hex').slice(0, 8).toUpperCase();
      const chunkName = `Script_BundleChunk_${stem}-${hash}.mjs`;
      chunkFiles.push({name: chunkName, code: file.text});
      chunkUrlBySpec.set(spec, './' + chunkName);
    }
    for (const inp of Object.keys(chunkBuild.metafile.inputs)) {
      if (!inp.startsWith('tx-shared-proxy:')) chunkInputs.add(inp.replace(/\\/g, '/'));
    }
    for (const out of Object.values(chunkBuild.metafile.outputs)) chunkOutputImports.push(...out.imports);
  }

  // Pass 3: build Script_BrowserBundle.mjs as a single zero-waterfall bundle that registers
  // shared module namespaces on globalThis.__txBundleMods before Script_Main.mjs runs, and
  // rewrites dynamic import('./Script_SandboxPlugin_*.mjs') to its content-hashed chunk URL.
  const registerSharedSource = [
    ...sharedList.map((rel, i) => `import * as __m${i} from ${JSON.stringify('./' + rel)};`),
    `globalThis.__txBundleMods=Object.freeze({${sharedList.map((rel, i) => `${JSON.stringify(rel)}:__m${i}`).join(',')}});`,
  ].join('\n');
  const mainEntrySource = 'import "tx-register-shared";\nimport "./Script_Main.mjs";\n';
  const result = await build({
    absWorkingDir: projectDir,
    stdin: {contents: mainEntrySource, resolveDir: projectDir, sourcefile: 'tx-main-entry.mjs', loader: 'js'},
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    metafile: true,
    // Keep vendor identity, worker-relative URLs and observable class/function names.
    external: ['three', './vendor/*'],
    minify: true,
    keepNames: true,
    legalComments: 'inline',
    charset: 'utf8',
    logLevel: 'silent',
    plugins: [...basePlugins, {name: 'wire-sandbox-chunks', setup(builder) {
      builder.onResolve({filter: /^tx-register-shared$/}, () => ({path: 'tx-register-shared', namespace: 'tx-virtual'}));
      builder.onLoad({filter: /^tx-register-shared$/, namespace: 'tx-virtual'}, () => ({
        contents: registerSharedSource, resolveDir: projectDir, loader: 'js',
      }));
      builder.onResolve({filter: SANDBOX_PLUGIN_RE}, args => {
        const chunkUrl = chunkUrlBySpec.get(args.path);
        return chunkUrl ? {path: chunkUrl, external: true} : undefined;
      });
    }}],
  });
  const code = result.outputFiles[0].text;
  const producedNames = new Set([bundleName, ...chunkFiles.map(file => file.name)]);
  const version = BigInt('0x' + createHash('sha256').update(code).digest('hex').slice(0, 13)).toString();
  const bundleUrl = './' + bundleName + '?v=' + version;
  const menuResult = await build({
    absWorkingDir: projectDir, entryPoints: ['Script_MenuStartup.mjs'], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true,
    external: ['three', './vendor/*'], minify: true, keepNames: true,
    legalComments: 'inline', charset: 'utf8', logLevel: 'silent', plugins: basePlugins,
  });
  const menuCode = menuResult.outputFiles[0].text;
  const menuVersion = BigInt('0x' + createHash('sha256').update(menuCode).digest('hex').slice(0, 13)).toString();
  const menuBundleName = 'Script_MenuBrowserBundle.mjs';
  const menuUrl = './' + menuBundleName + '?v=' + menuVersion;
  const entryResult = await build({
    absWorkingDir: projectDir, entryPoints: ['Script_Entry.mjs'], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', write: false,
    minify: true, keepNames: true, logLevel: 'silent',
    plugins: [...basePlugins, {name: 'runtime-entries', setup(builder) {
      builder.onResolve({filter: /^\.\/Script_(Main|MenuStartup)\.mjs$/}, args => ({
        path: args.path.includes('MenuStartup') ? menuUrl : bundleUrl, external: true,
      }));
    }}],
  });
  const entryCode = entryResult.outputFiles[0].text;
  const entryVersion = BigInt('0x' + createHash('sha256').update(entryCode).digest('hex').slice(0, 13)).toString();
  const entryBundleName = 'Script_EntryBrowserBundle.mjs';
  const entryUrl = './' + entryBundleName + '?v=' + entryVersion;
  // Pages stamps the entry by content first (Script_StampImportMaps); local --preview reads the unstamped source.
  const entryPattern = /<script type="module" src="\.\/Script_Entry\.mjs(?:\?v=\d+)?"><\/script>/;
  if (!entryPattern.test(sourceHtml)) throw new Error('Source boot markup changed; update the bundle builder');
  // A second source entry tag survives the single replace below and boots a second game
  // from the source graph next to the bundle (a merge left one behind on 2026-09-24).
  const entryCount = (sourceHtml.match(new RegExp(entryPattern.source, 'g')) || []).length;
  if (entryCount !== 1) throw new Error('index.html must have exactly one Script_Entry tag, found ' + entryCount);
  if (/<script\b[^>]*src="\.\/Script_(?:Main|MenuStartup)\.mjs/.test(sourceHtml)) throw new Error('The router must be the only runtime entry');
  // Only the small router and Three are unconditional. The router fetches one runtime.
  let html = sourceHtml.replace(entryPattern, '<script type="module" src="' + entryUrl + '"></script>');
  if (stripSplitTools || stripDevTools) {
    html = html.replace(/\s*<script data-editor-styles>[\s\S]*?<\/script>/g, '');
  }
  // Source modules remain available for workers and diagnostics, but are never bulk-preloaded.
  html = html.replace('</head>', '<link rel="modulepreload" href="' + entryUrl + '">\n'
    + '<link rel="modulepreload" href="' + imports.three + '">\n'
    + '<meta name="tengxian-menu-bundle" content="' + menuVersion + '">\n'
    + '<meta name="tengxian-bundle" content="' + version + '">\n</head>');
  const mainOutputImports = Object.values(result.metafile.outputs).flatMap(output => output.imports);
  const allOutputImports = [...mainOutputImports, ...chunkOutputImports];
  const externalImports = allOutputImports.filter(entry => {
    const normalized = entry.path.replace(/^\.\//, '');
    return !producedNames.has(normalized) && !normalized.startsWith('Script_BundleChunk_');
  });
  const chunkImports = mainOutputImports.filter(entry => producedNames.has(entry.path.replace(/^\.\//, '')));
  const IsRealInput = (inp) => !inp.startsWith('tx-virtual:') && inp !== 'tx-main-entry.mjs';
  const entryInputs = Object.keys(result.metafile.inputs).filter(IsRealInput).map(p => p.replace(/\\/g, '/'));
  const gameInputs = [...new Set([...entryInputs, ...chunkInputs])].sort();
  return {
    html, code, bundleName, version, inputs: gameInputs.length,
    gameInputs,
    entryInputs,
    menuVersion, menuInputs: Object.keys(menuResult.metafile.inputs),
    files: [{name: bundleName, code}, ...chunkFiles, {name: menuBundleName, code: menuCode}, {name: entryBundleName, code: entryCode}],
    chunkFiles,
    externalImports,
    chunkImports,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = process.argv.includes('--preview');
  if (!preview && !process.argv.includes('--deploy')) throw new Error('Use --preview for local acceptance or --deploy for the Pages staging checkout');
  const outputArg = process.argv.indexOf('--output-dir');
  const outputDir = outputArg >= 0 && process.argv[outputArg + 1] ? path.resolve(process.argv[outputArg + 1]) : projectDir;
  if (!preview && outputDir === projectDir) throw new Error('--deploy requires a separate --output-dir staging directory');
  // --strip-dev-tools: ship without the developer tools (see Data_DevTools.mjs). Not the Pages default yet.
  // The Pages build (--deploy) always drops the split-out tools; --preview keeps them for local acceptance.
  const result = await BuildBrowserBundle(preview ? projectDir : outputDir, {stripDevTools: process.argv.includes('--strip-dev-tools'), stripSplitTools: !preview});
  await fs.mkdir(outputDir, {recursive:true});
  for (const file of result.files) {
    const dest = path.join(outputDir, file.name);
    await fs.mkdir(path.dirname(dest), {recursive:true});
    await fs.writeFile(dest, file.code);
  }
  await fs.writeFile(path.join(outputDir, preview ? '_check_Bundle.html' : 'index.html'), result.html);
  console.log(JSON.stringify({mode:preview?'preview':'deploy',version:result.version,modules:result.inputs,chunks:result.chunkFiles.length,bytes:Buffer.byteLength(result.code),externalImports:[...new Set(result.externalImports.map(entry=>entry.path))]}));
}
