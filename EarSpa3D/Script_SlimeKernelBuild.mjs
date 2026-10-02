// Optional build tool only; the game ships the compiled binary, with a JS fallback.
// npm install --prefix EarSpa3D/_dev/KernelTools --no-audit --no-fund --ignore-scripts assemblyscript@0.28.20
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const Local=name=>fileURLToPath(new URL(name,import.meta.url));
const result=spawnSync(process.execPath,[Local('./_dev/KernelTools/node_modules/assemblyscript/bin/asc.js'),Local('./Script_SlimeKernel.ts'),'--outFile',Local('./Script_SlimeKernel.wasm'),'--optimizeLevel','3','--shrinkLevel','0','--runtime','stub','--noAssert','--initialMemory','4','--maximumMemory','64','--disable','nontrapping-f2i'],{stdio:'inherit'});
process.exit(result.status??1);
