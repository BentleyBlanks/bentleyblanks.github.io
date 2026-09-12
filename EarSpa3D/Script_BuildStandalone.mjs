// 把整个 EarSpa3D 打成**一个**可以双击打开的 .html。
//
// 为什么要专门写个打包器，而不是把目录压个包发出去：file:// 下浏览器有两道墙，
// 目录原样拷过去是打不开的——
//   ① ES module 的 import 走 fetch，file:// 上被 CORS 判为跨源，整局白屏；
//   ② fetch/XHR 读同目录的 .json/.glb/.png 同样被判跨源。
// 所以这里做两件事：
//   ① 用 esbuild 把模块图摊平成**一段内联 ESM**——内联脚本本身不需要 fetch，能跑；
//   ② 把 Audio/Models/Textures/*.json 全部 base64 塞进页面，启动时按需转成 blob: URL，
//      再把 fetch / XHR / img.src / innerHTML 这几个取资产的口子统统改道到 blob:。
//
// 产物只有一个文件，双击即玩；代价是体积（约 36 MB，主要是贴图与模型的 base64）。
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
// worktree 里没有 node_modules，esbuild 装在主检出上；顺着 git-common-dir 找回去。
const common = path.resolve(here, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: here, encoding: 'utf8' }).trim());
const mainRoot = path.dirname(common);
const require = createRequire(path.join(mainRoot, 'package.json'));
const esbuild = require('esbuild');

const ENTRY = 'Script_ChunkGame.js';
// 要随页面一起带走的资产目录（运行时靠相对路径取，全都得进包）。
const ASSET_DIRS = ['Audio', 'Models', 'Textures'];
const ASSET_FILES = ['Data_CanalProfile.json'];
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
};

/** 递归列目录，返回相对 here 的 POSIX 路径。 */
async function Walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(path.join(here, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await Walk(rel));
    else out.push(rel);
  }
  return out;
}

/** import 说明符上挂着 ?v= 缓存戳，esbuild 会当成文件名的一部分；解析前先摘掉。 */
const StripQuery = {
  name: 'earspa-strip-query',
  setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: path.join(here, 'vendor/three/build/three.module.js') }));
    build.onResolve({ filter: /\?/ }, (args) => {
      const bare = args.path.split('?')[0];
      if (bare === './vendor/three/build/three.module.js' || bare === 'three') {
        return { path: path.join(here, 'vendor/three/build/three.module.js') };
      }
      return { path: path.resolve(args.resolveDir, bare) };
    });
  },
};

// 用一段虚拟入口把 Start() 连同错误兜底一起卷进来：这样产物里一个 export 都不剩，
// 可以整段塞进 <script type="module">（模块顶层有 export 就没法这么用）。
const STDIN = `
import { Start } from ${JSON.stringify('./' + ENTRY)};
const boot = document.getElementById("ear-boot");
try {
  await Start();
} catch (error) {
  console.error(error);
  if (boot) {
    boot.innerHTML = "";
    const box = document.createElement("div");
    box.style.cssText = "max-width:32rem;padding:24px;text-align:center;line-height:1.7";
    const title = document.createElement("div");
    title.style.cssText = "font-size:18px;color:#e0cbb4;margin-bottom:8px";
    title.textContent = "没能启动";
    const detail = document.createElement("div");
    detail.style.cssText = "font-size:13px;color:#b3a596;word-break:break-all";
    detail.textContent = String(error && error.message ? error.message : error);
    box.append(title, detail);
    boot.append(box);
  }
}
`;

const bundle = await esbuild.build({
  stdin: { contents: STDIN, resolveDir: here, sourcefile: 'Script_StandaloneEntry.js', loader: 'js' },
  bundle: true,
  format: 'esm',
  // 不压缩：base64 资产占了 99% 的体积，压 JS 省不下什么，却会让出问题时无从下手。
  minify: false,
  write: false,
  metafile: true,
  charset: 'utf8',
  legalComments: 'inline',
  plugins: [StripQuery],
  logLevel: 'warning',
});
const code = bundle.outputFiles[0].text;
const graph = Object.keys(bundle.metafile?.inputs || {});
if (/^\s*export[\s{]/m.test(code)) throw new Error('产物里还有 export，没法当内联模块跑');

// ── 样式：内联，并把 url() 里的贴图换成 data: ──
let css = await fs.readFile(path.join(here, 'Style_Chunk.css'), 'utf8');
for (const match of [...css.matchAll(/url\(\s*['"](\.\/)?((?:Textures|Audio|Models)\/[^'"?]+)(\?[^'"]*)?['"]\s*\)/g)]) {
  const bytes = await fs.readFile(path.join(here, match[2]));
  const mime = MIME[path.extname(match[2]).toLowerCase()] || 'application/octet-stream';
  css = css.replace(match[0], `url("data:${mime};base64,${bytes.toString('base64')}")`);
}

// ── 资产表 ──
const assetPaths = [...ASSET_FILES];
for (const dir of ASSET_DIRS) assetPaths.push(...await Walk(dir));
const assets = {};
let rawBytes = 0;
for (const rel of assetPaths) {
  const bytes = await fs.readFile(path.join(here, rel));
  rawBytes += bytes.length;
  assets[rel] = bytes.toString('base64');
}

// base64 的字母表里没有 `<`，所以整块塞进 <script type="application/json"> 不会提前闭合。
const assetJson = JSON.stringify(assets);

const shell = await fs.readFile(path.join(here, 'index.html'), 'utf8');
const bootMarkup = shell.slice(shell.indexOf('<div id="ear-stage">'), shell.indexOf('<script type="importmap">')).trim();
const bootStyle = shell.slice(shell.indexOf('<style>') + 7, shell.indexOf('</style>'));

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<!-- Three.js 0.185.1 is used under the MIT License: https://github.com/mrdoob/three.js/blob/dev/LICENSE -->
<title>采耳物语 · EarSpa3D（本地单文件版）</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#141210">
<style>
${css}
</style>
<style>
${bootStyle}
</style>
</head>
<body>
${bootMarkup}

<script id="earspa-assets" type="application/json">${assetJson}</script>
<script>
/* 资产改道层。
   页面在 file:// 下跑，代码里那些 new URL('./Textures/x.png', import.meta.url) 解析出来
   是 file:///…/Textures/x.png，而 fetch 这种 URL 会被浏览器判跨源直接拒掉。
   所以把资产按「相对项目根的路径」做成表，取的时候换成 blob:——blob: 不受 file:// 的限制。
   只在第一次取到某个资产时才 base64 解码，开局不必把 30 MB 全解一遍。 */
(function () {
  var table = JSON.parse(document.getElementById('earspa-assets').textContent);
  var mime = ${JSON.stringify(MIME)};
  var cache = Object.create(null);
  var base = new URL('./', location.href).href;

  function MakeBlobUrl(key) {
    if (cache[key]) return cache[key];
    var b64 = table[key];
    if (!b64) return null;
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var dot = key.lastIndexOf('.');
    var type = mime[key.slice(dot).toLowerCase()] || 'application/octet-stream';
    return (cache[key] = URL.createObjectURL(new Blob([bytes], { type: type })));
  }

  /** 把任意写法的资产 URL 归一成表里的 key；不是资产就返回 null。 */
  function KeyOf(url) {
    if (typeof url !== 'string' || !url) return null;
    if (url.lastIndexOf('blob:', 0) === 0 || url.lastIndexOf('data:', 0) === 0) return null;
    var abs;
    try { abs = new URL(url, location.href).href; } catch (e) { return null; }
    if (abs.lastIndexOf(base, 0) !== 0) return null;
    var key = abs.slice(base.length).split('?')[0].split('#')[0];
    try { key = decodeURIComponent(key); } catch (e) { /* 原样用 */ }
    return table[key] ? key : null;
  }

  function Remap(url) {
    var key = KeyOf(url);
    return key ? MakeBlobUrl(key) : url;
  }
  window.__EarSpaAsset = Remap;

  // ① fetch：GLTFLoader / AudioLoader / 读 json 都走这里。
  var rawFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === 'string' || input instanceof URL) return rawFetch(Remap(String(input)), init);
    if (input && input.url) {
      var mapped = Remap(input.url);
      if (mapped !== input.url) return rawFetch(new Request(mapped, input), init);
    }
    return rawFetch(input, init);
  };

  // ② XHR：three 的老路径与第三方兜底会用。
  var rawOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = Remap(String(url));
    return rawOpen.apply(this, args);
  };

  // ③ img.src / audio.src：TextureLoader 走 ImageLoader，它是直接赋 src 的。
  [[HTMLImageElement, 'src'], [HTMLMediaElement, 'src'], [HTMLSourceElement, 'src']].forEach(function (pair) {
    var desc = Object.getOwnPropertyDescriptor(pair[0].prototype, pair[1]);
    if (!desc || !desc.set) return;
    Object.defineProperty(pair[0].prototype, pair[1], {
      configurable: true, enumerable: desc.enumerable, get: desc.get,
      set: function (value) { desc.set.call(this, Remap(String(value))); },
    });
  });

  // ④ innerHTML / insertAdjacentHTML：工具图标是拼成 <img src="./Textures/Ui/…"> 塞进去的，
  //    HTML 解析器建出来的 img 不经过上面那个 setter，只能在字符串阶段先换掉。
  var htmlAsset = /(["'(])(\\.\\/)?((?:Textures|Audio|Models)\\/[^"')\\s]+)/g;
  function RemapHtml(text) {
    if (typeof text !== 'string' || text.indexOf('/') < 0) return text;
    return text.replace(htmlAsset, function (whole, quote, dot, rel) {
      var mapped = Remap(rel);
      return mapped === rel ? whole : quote + mapped;
    });
  }
  var innerHost = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML') ? Element.prototype : HTMLElement.prototype;
  var innerDesc = Object.getOwnPropertyDescriptor(innerHost, 'innerHTML');
  if (innerDesc && innerDesc.set) {
    Object.defineProperty(innerHost, 'innerHTML', {
      configurable: true, enumerable: innerDesc.enumerable, get: innerDesc.get,
      set: function (value) { innerDesc.set.call(this, RemapHtml(String(value))); },
    });
  }
  var rawInsert = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (position, text) {
    return rawInsert.call(this, position, RemapHtml(String(text)));
  };

  // ⑤ 兜底：万一还有没盖到的口子（比如直接 setAttribute），让它别停在 404 上。
  new MutationObserver(function (records) {
    for (var r = 0; r < records.length; r++) {
      var added = records[r].addedNodes;
      for (var n = 0; n < added.length; n++) {
        var node = added[n];
        if (!node.querySelectorAll) continue;
        var list = node.tagName === 'IMG' ? [node] : node.querySelectorAll('img[src]');
        for (var i = 0; i < list.length; i++) {
          var attr = list[i].getAttribute('src'), mapped = Remap(attr);
          if (mapped !== attr) list[i].setAttribute('src', mapped);
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
</script>

<script type="module">
${code}
</script>
</body>
</html>
`;

// 默认落在 _dev/：45 MB 的产物不进仓库（.gitignore 已挡整个 _dev/）。
const outPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, '_dev', 'EarSpa3D_Standalone.html');
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, html, 'utf8');
console.log(`模块 ${graph.length || '?'} 个，JS ${(code.length / 1024).toFixed(0)} KB，资产 ${assetPaths.length} 个 / ${(rawBytes / 1048576).toFixed(1)} MB`);
console.log(`产物 ${outPath} · ${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB`);
