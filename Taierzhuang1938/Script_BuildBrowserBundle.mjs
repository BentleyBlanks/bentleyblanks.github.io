// Pages uses one content-stamped first-party module; local development keeps the import map.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
export async function BuildBrowserBundle() {
  const sourceHtml = await fs.readFile(path.join(projectDir, 'index.html'), 'utf8');
  const mapMatch = sourceHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!mapMatch) throw new Error('Source import map is missing');
  const imports = JSON.parse(mapMatch[1]).imports;
  const result = await build({
    absWorkingDir: projectDir, entryPoints: ['Script_Main.mjs'], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true,
    // Keep vendor identity, worker-relative URLs and observable class/function names.
    external: ['three', './vendor/*'], minify: true, keepNames: true,
    legalComments: 'inline', charset: 'utf8', logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const version = BigInt('0x' + createHash('sha256').update(code).digest('hex').slice(0, 13)).toString();
  const bundleName = 'Script_BrowserBundle.mjs';
  const bundleUrl = './' + bundleName + '?v=' + version;
  const preloadUrls = [...new Set([bundleUrl, ...Object.entries(imports)
    .filter(([key]) => key === 'three' || key.startsWith('./vendor/')).map(([,url]) => url)])];
  const preloadPattern = /<script>\s*\{\s*const map = JSON.parse\([\s\S]*?<\/script>/;
  const entryPattern = /<script type="module" src="\.\/Script_Main\.mjs\?v=\d+"><\/script>/;
  if (!preloadPattern.test(sourceHtml) || !entryPattern.test(sourceHtml)) throw new Error('Source boot markup changed; update the bundle builder');
  let html = sourceHtml.replace(preloadPattern, preloadUrls.map(url => '<link rel="modulepreload" href="' + url + '">').join('\n  '))
    .replace(entryPattern, '<script type="module" src="' + bundleUrl + '"></script>');
  // Source modules remain available for workers and diagnostics, but are never bulk-preloaded.
  html = html.replace('</head>', '<meta name="tengxian-bundle" content="' + version + '">\n</head>');
  return {html, code, bundleName, version, inputs: Object.keys(result.metafile.inputs).length,
    externalImports: Object.values(result.metafile.outputs).flatMap(output => output.imports)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = process.argv.includes('--preview');
  if (!preview && !process.argv.includes('--deploy')) throw new Error('Use --preview for local acceptance or --deploy for the Pages staging checkout');
  const outputArg = process.argv.indexOf('--output-dir');
  const outputDir = outputArg >= 0 && process.argv[outputArg + 1] ? path.resolve(process.argv[outputArg + 1]) : projectDir;
  if (!preview && outputDir === projectDir) throw new Error('--deploy requires a separate --output-dir staging directory');
  const result = await BuildBrowserBundle();
  await fs.mkdir(outputDir, {recursive:true});
  await fs.writeFile(path.join(outputDir, result.bundleName), result.code);
  await fs.writeFile(path.join(outputDir, preview ? '_check_Bundle.html' : 'index.html'), result.html);
  console.log(JSON.stringify({mode:preview?'preview':'deploy',version:result.version,modules:result.inputs,bytes:Buffer.byteLength(result.code),externalImports:[...new Set(result.externalImports.map(entry=>entry.path))]}));
}
