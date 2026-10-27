// One controlled BlenderMCP round for this single asset. No permanent MCP setup.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const controller = path.join(repo, 'scripts/Script_BlenderMcp.mjs');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Build one Type89MediumTank source/derived mesh through its own BlenderMCP round.\n  --quality=High|Game (default High)\n  --stage=Gray|Pbr (Pbr bakes both retained high and derived game sources)\n  --probe (local PBR pipeline check; never publishes the probe asset)\n  --probe-size=256 (use 1024 for material review)\n  --revision=SurfaceV2 (separate raw map/checkpoint folder)\n  --views=FrontLeft,Front,RearLeft\n  --no-render\nThe .blend is saved in the prescribed OneDrive model directory. Temporary GLB/review images stay local. Pbr requires the task HighGray/GameGray sources. The owned Blender instance is stopped in finally.');
  console.log('  --stage-only (Pbr): save the full candidate without replacing the runtime model; validate before promotion.');
  process.exit(0);
}
const Read = (name, fallback) => args.find((item) => item.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const quality = Read('quality', 'High');
const stage = Read('stage', 'Gray');
if (!['High', 'Game'].includes(quality) || !['Gray','Pbr'].includes(stage)) throw new Error('Unknown quality/stage');
const script = path.join(here, stage==='Pbr'?'Script_Type89PbrBake.py':'Script_Type89MediumTank.py').replaceAll('\\', '/');
const logDir = path.join(repo, 'tmp/Type89MediumTank');
fs.mkdirSync(logDir, { recursive: true });
function Call(parameters, input) {
  const result = spawnSync(process.execPath, [controller, ...parameters, '--json'], { cwd: repo, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error(result.stderr || result.stdout || `Controller failed with ${result.status}`); }
  if (result.status || parsed.status === 'error' || parsed.error) throw new Error(JSON.stringify(parsed));
  return parsed;
}
let port;
try {
  const sourceSubdir=Read('source-subdir',''),reviewSubdir=Read('review-subdir','');
  const blend = path.join('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank',sourceSubdir,'Scene_Type89MediumTankGameGray.blend');
  const started = Call(['start', ...(stage==='Pbr'?[blend]:[]), '--task', 'Type89MediumTank']);
  port = started.port ?? started.instance?.port;
  if (!port) throw new Error(`No task port in start response: ${JSON.stringify(started)}`);
  const code = `import os\nos.environ['TYPE89_QUALITY']=${JSON.stringify(quality)}\nos.environ['TYPE89_STAGE']=${JSON.stringify(stage)}\nos.environ['TYPE89_PBR_PROBE']=${JSON.stringify(args.includes('--probe')?'1':'0')}\nos.environ['TYPE89_PBR_PROBE_SIZE']=${JSON.stringify(Read('probe-size','256'))}\nos.environ['TYPE89_PBR_REVISION']=${JSON.stringify(Read('revision',''))}\nos.environ['TYPE89_RENDER']=${JSON.stringify(args.includes('--no-render') ? '0' : '1')}\nos.environ['TYPE89_VIEWS']=${JSON.stringify(Read('views', 'FrontLeft,Front,RearLeft'))}\nscriptPath=${JSON.stringify(script)}\nexec(compile(open(scriptPath,encoding='utf8').read(),scriptPath,'exec'),{'__file__':scriptPath,'__name__':'__main__'})\n`;
  // Full 8K normal projection includes per-texel high-surface repair and may
  // exceed one hour on the shared workstation; keep the owned bake alive.
  const stagedCode = `import os\nos.environ['TYPE89_SOURCE_SUBDIR']=${JSON.stringify(sourceSubdir)}\nos.environ['TYPE89_REVIEW_SUBDIR']=${JSON.stringify(reviewSubdir)}\nos.environ['TYPE89_PBR_STAGE_ONLY']=${JSON.stringify(args.includes('--stage-only')?'1':'0')}\n`+code;
  const executed = Call(['exec', '--port', String(port), '--stdin', '--timeout', stage==='Pbr'?'10800':'600'], stagedCode);
  fs.writeFileSync(path.join(logDir, `Log_${quality}${stage}Build.json`), JSON.stringify(executed, null, 2));
  const revision=Read('revision','');
  const workName=revision?(revision+(args.includes('--probe')?'Probe':'')):(args.includes('--probe')?'Probe':'Final');
  console.log(fs.readFileSync(path.join(repo, 'Taierzhuang1938/_shots/Type89MediumTank',reviewSubdir,`${stage==='Pbr'?'Data_Pbr'+workName+'Build.json':'Data_'+quality+stage+'Build.json'}`), 'utf8'));
} finally {
  if (port) console.log(JSON.stringify(Call(['stop', '--port', String(port)])));
}
