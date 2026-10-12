// Pages selects a separately stamped menu or game bundle; development keeps the import map.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
// Developer tools (advanced tools + debug overlays) are reachable only through these two
// boundary modules; stripping swaps each for its stub and leaves every other import intact.
export const DEV_TOOL_STUBS = Object.freeze({
  './Script_DevTools.mjs': './Script_DevToolsStub.mjs',
  './Data_DevTools.mjs': './Data_DevToolsStub.mjs',
});
function StripDevToolsPlugin(projectDir) {
  return {name: 'strip-dev-tools', setup(builder) {
    builder.onResolve({filter: /^\.\/(?:Script|Data)_DevTools\.mjs$/}, args => ({path: path.join(projectDir, DEV_TOOL_STUBS[args.path])}));
  }};
}
export async function BuildBrowserBundle(projectDir = path.dirname(fileURLToPath(import.meta.url)), {stripDevTools = false} = {}) {
  const plugins = stripDevTools ? [StripDevToolsPlugin(projectDir)] : [];
  const sourceHtml = await fs.readFile(path.join(projectDir, 'index.html'), 'utf8');
  const mapMatch = sourceHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!mapMatch) throw new Error('Source import map is missing');
  const imports = JSON.parse(mapMatch[1]).imports;
  const result = await build({
    absWorkingDir: projectDir, entryPoints: ['Script_Main.mjs'], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true,
    // Keep vendor identity, worker-relative URLs and observable class/function names.
    external: ['three', './vendor/*'], minify: true, keepNames: true,
    legalComments: 'inline', charset: 'utf8', logLevel: 'silent', plugins,
  });
  const code = result.outputFiles[0].text;
  const version = BigInt('0x' + createHash('sha256').update(code).digest('hex').slice(0, 13)).toString();
  const bundleName = 'Script_BrowserBundle.mjs';
  const bundleUrl = './' + bundleName + '?v=' + version;
  const menuResult = await build({
    absWorkingDir: projectDir, entryPoints: ['Script_MenuStartup.mjs'], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true,
    external: ['three', './vendor/*'], minify: true, keepNames: true,
    legalComments: 'inline', charset: 'utf8', logLevel: 'silent', plugins,
  });
  const menuCode = menuResult.outputFiles[0].text;
  const menuVersion = BigInt('0x' + createHash('sha256').update(menuCode).digest('hex').slice(0, 13)).toString();
  const menuBundleName = 'Script_MenuBrowserBundle.mjs';
  const menuUrl = './' + menuBundleName + '?v=' + menuVersion;
  const entryResult = await build({
    absWorkingDir: projectDir, entryPoints: ['Script_Entry.mjs'], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', write: false,
    minify: true, keepNames: true, logLevel: 'silent',
    plugins: [{name: 'runtime-entries', setup(builder) {
      builder.onResolve({filter: /^\.\/Script_(Main|MenuStartup)\.mjs$/}, args => ({
        path: args.path.includes('MenuStartup') ? menuUrl : bundleUrl, external: true,
      }));
    }}],
  });
  const entryCode = entryResult.outputFiles[0].text;
  const entryVersion = BigInt('0x' + createHash('sha256').update(entryCode).digest('hex').slice(0, 13)).toString();
  const entryBundleName = 'Script_EntryBrowserBundle.mjs';
  const entryUrl = './' + entryBundleName + '?v=' + entryVersion;
  const entryPattern = /<script type="module" src="\.\/Script_Entry\.mjs\?v=\d+"><\/script>/;
  if (!entryPattern.test(sourceHtml)) throw new Error('Source boot markup changed; update the bundle builder');
  // A second source entry tag survives the single replace below and boots a second game
  // from the source graph next to the bundle (a merge left one behind on 2026-09-24).
  const entryCount = (sourceHtml.match(new RegExp(entryPattern.source, 'g')) || []).length;
  if (entryCount !== 1) throw new Error('index.html must have exactly one Script_Entry tag, found ' + entryCount);
  if (/<script\b[^>]*src="\.\/Script_(?:Main|MenuStartup)\.mjs/.test(sourceHtml)) throw new Error('The router must be the only runtime entry');
  // Only the small router and Three are unconditional. The router fetches one runtime.
  let html = sourceHtml.replace(entryPattern, '<script type="module" src="' + entryUrl + '"></script>');
  // Source modules remain available for workers and diagnostics, but are never bulk-preloaded.
  html = html.replace('</head>', '<link rel="modulepreload" href="' + entryUrl + '">\n'
    + '<link rel="modulepreload" href="' + imports.three + '">\n'
    + '<meta name="tengxian-menu-bundle" content="' + menuVersion + '">\n'
    + '<meta name="tengxian-bundle" content="' + version + '">\n</head>');
  return {html, code, bundleName, version, inputs: Object.keys(result.metafile.inputs).length,
    gameInputs: Object.keys(result.metafile.inputs),
    menuVersion, menuInputs: Object.keys(menuResult.metafile.inputs),
    files: [{name: bundleName, code}, {name: menuBundleName, code: menuCode}, {name: entryBundleName, code: entryCode}],
    externalImports: Object.values(result.metafile.outputs).flatMap(output => output.imports)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = process.argv.includes('--preview');
  if (!preview && !process.argv.includes('--deploy')) throw new Error('Use --preview for local acceptance or --deploy for the Pages staging checkout');
  const outputArg = process.argv.indexOf('--output-dir');
  const outputDir = outputArg >= 0 && process.argv[outputArg + 1] ? path.resolve(process.argv[outputArg + 1]) : projectDir;
  if (!preview && outputDir === projectDir) throw new Error('--deploy requires a separate --output-dir staging directory');
  // --strip-dev-tools: ship without the developer tools (see Data_DevTools.mjs). Not the Pages default yet.
  const result = await BuildBrowserBundle(preview ? projectDir : outputDir, {stripDevTools: process.argv.includes('--strip-dev-tools')});
  await fs.mkdir(outputDir, {recursive:true});
  for (const file of result.files) await fs.writeFile(path.join(outputDir, file.name), file.code);
  await fs.writeFile(path.join(outputDir, preview ? '_check_Bundle.html' : 'index.html'), result.html);
  console.log(JSON.stringify({mode:preview?'preview':'deploy',version:result.version,modules:result.inputs,bytes:Buffer.byteLength(result.code),externalImports:[...new Set(result.externalImports.map(entry=>entry.path))]}));
}
