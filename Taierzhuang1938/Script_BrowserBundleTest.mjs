// Exercise the exact Pages payload, including the ordinary whitebox Start button.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {BuildBrowserBundle} from './Script_BuildBrowserBundle.mjs';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const result = await BuildBrowserBundle();
assert.ok(result.inputs > 150, 'bundle contains the complete first-party graph');
assert.ok(result.externalImports.every(entry => entry.path === 'three' || entry.path.startsWith('./vendor/')), 'no first-party import waterfall remains');
assert.ok(!result.html.includes('Object.values(map.imports)'), 'production never preloads the source graph');
assert.ok(result.html.includes('Script_BrowserBundle.mjs?v=' + result.version));
assert.ok((result.html.match(/rel="modulepreload"/g) || []).length <= 12);
const root = path.resolve(import.meta.dirname, '..');
const server = await ServeRoot(root, 0);
const browser = await LaunchBrowser();
const outputDir = path.join(os.tmpdir(), 'WhiteboxBootFix');
await fs.mkdir(outputDir, {recursive:true});
try {
  for (const fixture of [{name:'Whitebox',query:'whitebox=p012'}, {name:'MainMenu',query:''}, {name:'MissingCharacters',query:'whitebox=p012'}]) {
    const page = await browser.newPage({viewport:{width:1280,height:720}});
    const errors = [], modules = new Set(), failedSets = [];
    page.on('console', message => { const match = message.text().match(/外部 PBR「(\w+)」/); if (match) failedSets.push(match[1]); });
    if (fixture.name === 'Whitebox') {
      // The reported DadaoPbr crash needs a real image timeout; carriage failures must be safe too.
      await page.route('**/Texture_DadaoBase.webp*', () => {});
      await page.route(/Texture_Carriage(?:BenchWood|FloorSteel|CeilingSteel)Base\.webp/, route => route.fulfill({status:404,body:'missing test texture'}));
    }
    if (fixture.name === 'MissingCharacters') {
      await page.route(/Model_TengxianNra0[124][.]glb/,
        route => route.fulfill({status:503,body:'interrupted character download'}));
      await page.addInitScript(() => {
        window.bundleFixtureErrors=[];
        window.addEventListener('error',event=>window.bundleFixtureErrors.push(event.message));
      });
    }
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => { if (/\.m?js(?:\?|$)/.test(request.url())) modules.add(new URL(request.url()).pathname); });
    await page.route('**/Taierzhuang1938/?*', route => route.fulfill({contentType:'text/html',body:result.html}));
    let releaseBundle;
    const bundleGate = fixture.name === 'Whitebox' ? new Promise(resolve => {releaseBundle=resolve;}) : Promise.resolve();
    await page.route('**/Script_BrowserBundle.mjs?*', async route => { await bundleGate; await route.fulfill({contentType:'text/javascript',body:result.code}); });
    const started = Date.now();
    await page.goto('http://127.0.0.1:' + server.address().port + '/Taierzhuang1938/?' + fixture.query + '&quality=low&scale=small', {waitUntil:'commit',timeout:60000});
    if (releaseBundle) {
      try {
        await page.waitForFunction(() => document.getElementById('bootStep')?.textContent.startsWith('加载较慢：'), null, {timeout:40000});
        assert.equal(await page.locator('#bootRetry').count(), 1, 'slow downloads offer an optional retry without reporting failure');
      } finally { releaseBundle(); }
    }
    await page.waitForFunction(() => window.Tengxian?.state?.ready || document.getElementById('bootStep')?.textContent.startsWith('启动失败：'), null, {timeout:180000});
    assert.equal(await page.evaluate(() => window.Tengxian?.state?.ready), true, await page.locator('#bootStep').textContent());
    if (fixture.name === 'Whitebox') {
      const expectedFallbacks = ['DadaoPbr','CarriageBenchWood','CarriageFloorSteel','CarriageCeilingSteel'];
      assert.deepEqual(failedSets.sort(), [...expectedFallbacks].sort(), 'only the four interrupted texture sets use fallback materials');
      assert.ok(await page.evaluate(names => names.every(name => { const material=window.Tengxian.library.Get(name); return material.map && material.normalMap && material.roughnessMap; }), expectedFallbacks), 'each fallback supplies a usable complete PBR material');
      assert.equal(await page.locator('#bootRetry').count(), 0, 'normal boot clears the slow-download notice');
      assert.ok(await page.locator('#bootStart').isEnabled());
      await page.locator('#bootStart').click();
      await page.waitForFunction(() => window.Tengxian.state.running && document.getElementById('boot').classList.contains('gone'), null, {timeout:10000});
      const before = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().time);
      await page.waitForFunction(before => window.Tengxian.Debug.FirstLevelMission().time > before, before, {timeout:10000});
      assert.ok(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage === "Trapped"));
    } else if (fixture.name === 'MissingCharacters') {
      // The 09.23 opening director creates its comrade, runner, shouter and interpreter only
      // after Start. Preserve each selected appearance slot through the failed
      // downloads, then exercise their actual director and close-up performances.
      const partial=await page.evaluate(()=>{const g=window.Tengxian;
        const actors=g.ai.soldiers.filter(a=>a.alive&&a.side==='nra');
        const mission=g.Debug.FirstLevelMission();
        return {count:actors.length,models:Object.fromEntries(actors.map(a=>[a.castId,a.actor?.characterRig?.modelId||null])),
          cast:actors.map(a=>a.castId).filter(Boolean).sort(),stage:mission.stage};});
      assert.equal(partial.stage,'Trapped','the interrupted boot still opens on the collapsed bunker');
      assert.equal(partial.count,4,'all four squad members exist before the director starts');
      assert.deepEqual(partial.cast,['heyoutian','liuwencai','luo','yaowa'],'the whole squad is physically present');
      assert.deepEqual(partial.models,{luo:'TengxianNra05',yaowa:null,heyoutian:null,liuwencai:null},
        'failed selected slots stay whitebox; the surviving approved leader keeps his own appearance');
      await page.locator('#bootStart').click();
      await page.waitForFunction(()=>window.Tengxian.state.running&&document.getElementById('boot').classList.contains('gone'),null,{timeout:10000});
      await page.waitForFunction(()=>{const b=window.Tengxian.Debug.FirstLevelMissionRuntime()?.frontShow?.bunker;
        return window.bundleFixtureErrors.length||b?.ready&&b.setup&&b.firstPerson;},null,{timeout:60000});
      assert.deepEqual(await page.evaluate(()=>window.bundleFixtureErrors),[],
        'the new opening director must finish setup with missing selected character models');
      const setup=await page.evaluate(()=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),b=r.frontShow.bunker;
        const Person=a=>{const root=a?.actor?.root;let attached=false;
          for(let node=root;node;node=node.parent)if(node===r.scene)attached=true;
          return {alive:a?.alive===true,physical:!!root&&root.children.length>0&&!!a.body&&g.ai.soldiers.includes(a),
            attached,lod:a?.renderLod||null,
            finite:!!root&&[...root.position.toArray(),...root.quaternion.toArray(),...root.scale.toArray(),a.position.x,a.position.y,a.position.z].every(Number.isFinite),
            model:a?.actor?.characterRig?.modelId||null};};
        // Backdrop NRA (MISSION_ENCOUNTERS role backdropNra and the Data_FirstLevelBackdropSquads walkers) are extras: count the named seven.
        const backdrop=new Set((r.backdrop?.members||[]).map(m=>m.actor));
        for(const a of g.ai.soldiers)if(a.side==='nra'&&/^(BunkerBackdropNra|Opening_DepthNra)/.test(a.missionId||''))backdrop.add(a); // MISSION_ENCOUNTERS backdropNra and the SB01 depth walkers (2026-09-25 storyboard round)
        return {count:g.ai.soldiers.filter(a=>a.alive&&a.side==='nra'&&!backdrop.has(a)).length,backdrop:backdrop.size,nra:g.ai.soldiers.filter(a=>a.alive&&a.side==='nra'&&!backdrop.has(a)).map(a=>a.missionId||a.castId||a.id),
          captives:b.captives.map(a=>a.missionId).sort(),
          cast:Object.fromEntries(Object.entries(b.cast).map(([id,a])=>[id,Person(a)])),
          squad:Object.fromEntries(r.squad.map(a=>[a.castId,Person(a)])),
          enemies:Object.fromEntries(['BunkerExecutionerA','BunkerExecutionerB','BunkerFollowA','BunkerFollowB'].map(id=>[id,Person(r.enemies.get(id))])),
          playerModel:b.playerBody?.characterRig?.modelId||null};});
      assert.equal(setup.count,7,`the four squad members, the wounded comrade, the runner and the shouter all remain physical NRA actors (${JSON.stringify(setup.nra)})`);
      assert.deepEqual(setup.captives,['Opening_comrade'],'the opening has exactly one physical captive (the wounded comrade)');
      assert.deepEqual(Object.keys(setup.cast).sort(),['DepthNraA','DepthNraB','DepthNraC','comrade','interpreter','runner','shouter'], // DepthNra*: SB01 depth walkers (01-03 storyboard contract §2 item 3)
        'the director creates its complete current cast after Start');
      assert.deepEqual(Object.fromEntries(Object.entries(setup.cast).map(([id,a])=>[id,a.model])),
        {DepthNraA:'TengxianNra05',DepthNraB:'TengxianNra05',DepthNraC:'TengxianNra05',comrade:null,interpreter:'TengxianNra06',runner:null,shouter:null},
        'new cast uses its requested model slots instead of reassigning failed downloads '
        +'(comrade, runner and shouter are pinned to NRA02 since the 09-23 face package; the interpreter wears his own NRA06 since 2026-09-24)');
      assert.equal(setup.playerModel,null,'the protagonist also preserves the missing NRA02 slot');
      for(const [id,actor] of Object.entries({...setup.squad,...setup.cast,...setup.enemies})) {
        assert.ok(actor.alive&&actor.physical&&actor.finite,`${id} remains a live physical person: ${JSON.stringify(actor)}`);
        assert.ok(actor.attached||['culled','crowd'].includes(actor.lod),
          `${id} must be in the scene or explicitly represented by the normal culling/LOD system`);
      }
      // Let ordinary production time and the real cue tracks drive the complete
      // captive/contact sequence into the interrogation close-up. No debug jump,
      // synthetic mission facts or manual phase advancement may mask a crash.
      await page.waitForFunction(()=>{const b=window.Tengxian.Debug.FirstLevelMissionRuntime()?.frontShow?.bunker;
        return window.bundleFixtureErrors.length||b?.phase==='Interrogation'&&b.Age>2;},null,{timeout:240000});
      const closeup=await page.evaluate(()=>{const r=window.Tengxian.Debug.FirstLevelMissionRuntime(),b=r.frontShow.bunker;
        const actors=[...r.squad,...Object.values(b.cast),...['BunkerExecutionerA','BunkerExecutionerB','BunkerFollowA','BunkerFollowB'].map(id=>r.enemies.get(id))];
        return {errors:window.bundleFixtureErrors,stage:r.flow.stage.id,phase:b.phase,time:r.time,
          beats:[...b.beats],camera:r.player.camera.position.toArray(),captives:b.captives.map(a=>({id:a.missionId,alive:a.alive})),
          actors:actors.map(a=>{const root=a?.actor?.root;let attached=false,finite=!!root;
            if(a?.openingStoryboardHidden)return {id:a?.castId||a?.missionId,hidden:true,finite:true};
            for(let node=root;node;node=node.parent)if(node===r.scene)attached=true;
            root?.traverse(node=>{finite&&=node.matrixWorld.elements.every(Number.isFinite);});
            return {id:a?.castId||a?.missionId,attached,finite,lod:a?.renderLod||null};})};});
      await fs.writeFile(path.join(outputDir,'MissingCharacters.json'),JSON.stringify({partial,setup,closeup},null,2));
      assert.deepEqual(closeup.errors,[],'missing characters must not crash the captive, collar, strike or interrogation performances');
      assert.equal(closeup.stage,'Trapped');
      assert.equal(closeup.phase,'Interrogation');
      for(const phase of ['Banter','Orders','Incoming','Blast','Black','Wake','FrontPass','CaptiveDragged','CaptiveWall','Interrogation'])
        assert.ok(closeup.beats.includes(phase),'the missing-model run physically completed '+phase);
      assert.deepEqual(closeup.captives,[{id:'Opening_comrade',alive:true}],
        'the actual captive survives creation and kneels at the wall for the interrogation');
      for(const actor of closeup.actors)assert.ok(actor.finite&&(actor.hidden||actor.attached||['culled','crowd'].includes(actor.lod)),
        `${actor.id} still has a finite hierarchy under the normal culling/LOD contract`);
      for(const id of ['BunkerExecutionerA','interpreter']) {
        const actor=closeup.actors.find(a=>a.id===id||a.id==='Opening_'+id); // director cast report their missionId (Opening_<key>)
        assert.ok(actor?.attached&&actor.lod==='detail',`${id} must actually render in the interrogation close-up`);
      }
      assert.ok(closeup.camera.every(Number.isFinite),'the interrogation camera remains finite');
    } else {
      assert.equal(await page.evaluate(() => window.Tengxian.Debug.Menu().open), true);
      await page.evaluate(()=>window.Tengxian.Debug.MenuAct("debug"));
      assert.equal(await page.locator("#firstLevelStageSelect option").count(),18);
      await page.selectOption("#firstLevelStageSelect","Transfer");
      await page.locator('[data-action="firstLevelJump"]').click();
      await page.waitForFunction(()=>window.Tengxian?.state?.running&&!window.Tengxian.state.advancing&&window.Tengxian.Debug.FirstLevelMission()?.phaseNumber===12,null,{timeout:180000});
      assert.ok(await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission().facts.includes("courtyardPassed")));
    }
    assert.deepEqual(errors, []);
    assert.ok(![...modules].some(url => url.endsWith('/Script_Main.mjs')), 'source entry is not also loaded');
    assert.ok(modules.size <= 20, 'startup remains below 20 distinct script requests: ' + modules.size);
    await page.screenshot({path:path.join(outputDir,fixture.name+'.png')});
    console.log('PASS',fixture.name,JSON.stringify({seconds:(Date.now()-started)/1000,scriptRequests:modules.size,version:result.version,outputDir}));
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
