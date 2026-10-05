// Real game entry: secondary-page focus transitions and player audio preferences.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const project = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(project, "_shots/CommandRoom");
fs.mkdirSync(out, { recursive: true });
const server = await ServeRoot(path.dirname(project), 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
const errors = [], result = {};
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
const WaitRoom = () => page.waitForFunction(() => window.Taierzhuang?.Debug?.CommandRoom?.().ready && window.Taierzhuang.menu.open, {}, { timeout: 240000 });
const Settled = mode => page.waitForFunction(m => {
  const s = window.Taierzhuang.Debug.CommandRoom().presentation;
  return s.mode === m && (m === "title" ? s.panelFocus < .001 : s.panelFocus > .999);
}, mode);
const Shot = name => page.screenshot({ path: path.join(out, `Scene_${name}.png`) });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?quality=high&scale=small`, { timeout: 120000 });
  await WaitRoom(); await Settled("title");
  await Shot("FocusTitle");
  result.title = await page.evaluate(() => window.Taierzhuang.Debug.CommandRoom().presentation);
  for (const mode of ["levels", "codex", "credits", "settings"]) {
    await page.evaluate(m => window.Taierzhuang.menu.Show(m), mode);
    await Settled(mode);
    if (mode === "levels") await page.waitForFunction(() => [...document.querySelectorAll(".mnPanel img")].filter(i => i.offsetParent).every(i => i.complete && i.naturalWidth));
    const sharpUi = await page.locator(".mnPanelTitle").evaluate(el => {
      const styles = [];
      for (let p = el; p; p = p.parentElement) styles.push(getComputedStyle(p).filter);
      return styles.every(v => v === "none");
    });
    assert.ok(sharpUi, `${mode}: UI must not inherit the background blur`);
    await Shot(`Focus${mode}`);
  }
  await page.click('[data-setting="sound"]'); await Settled("sound");
  await Shot("AudioDesktop");
  assert.equal(await page.locator(".audioRange").count(), 4);
  assert.equal(await page.getByRole("switch").count(), 2);
  assert.equal(await page.locator(".audioSettings").getByText("在响的节点").count(), 0);
  await page.getByRole("slider", { name: "总音量", exact: true }).focus();
  await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#audio-master").inputValue(), "2", "Native keyboard adjustments reach the slider");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement.id), "audio-sfx");
  await page.locator("#audio-master").fill("64");
  await page.locator("#audio-sfx").fill("42");
  await page.locator("#audio-music").fill("58");
  await page.locator("#audio-ambience").fill("24");
  await page.getByRole("switch", { name: "人物配音" }).click();
  await page.getByRole("switch", { name: "暂停时静音背景" }).click();
  await page.waitForFunction(() => Math.abs(window.Taierzhuang.audio.sfxUser.gain.value - .42) < .001);
  result.audio = await page.evaluate(() => {
    const a = window.Taierzhuang.audio;
    return { master: a.masterVolume, mix: a.mix, sfxNode: a.sfxUser.gain.value,
      voiceMute: a.voiceMute, paused: a.paused, saved: JSON.parse(localStorage.getItem("tengxian1938_audio_v1")) };
  });
  assert.equal(result.audio.master, .64); assert.equal(result.audio.mix.sfx, .42);
  assert.equal(result.audio.mix.music, .58); assert.equal(result.audio.mix.ambience, .24);
  assert.ok(result.audio.voiceMute); assert.equal(result.audio.paused, false);
  assert.deepEqual(result.audio.saved, { master: .64, sfx: .42, music: .58, ambience: .24, voiceMute: true, pauseSilence: false });
  // Exercise the real preview route while the browser remains muted by the test kit.
  await page.evaluate(() => {
    const a = window.Taierzhuang.audio, play = a.Play.bind(a);
    a.Play = (...args) => { window.previewCue = args[0]; return play(...args); };
  });
  await page.getByRole("button", { name: "试听音效", exact: true }).click();
  assert.equal(await page.evaluate(() => window.previewCue), "rifleNra");
  await page.keyboard.press("Escape"); await Settled("settings");
  assert.equal(await page.locator(".audioSettings").count(), 0);
  for (const mode of ["graphics", "controls"]) {
    await page.click(`[data-setting="${mode}"]`); await Settled(mode);
    await page.keyboard.press("Escape"); await Settled("settings");
  }
  await page.click('[data-setting="debug"]'); await Settled("debug");
  await page.keyboard.press("Escape"); await Settled("settings");
  await page.keyboard.press("Escape"); await Settled("title");
  result.returned = await page.evaluate(() => window.Taierzhuang.Debug.CommandRoom().presentation);
  await page.reload({ timeout: 120000 }); await WaitRoom();
  await page.evaluate(() => window.Taierzhuang.menu.Show("settings"));
  await page.click('[data-setting="sound"]'); await Settled("sound");
  assert.equal(await page.locator("#audio-master").inputValue(), "64", "Audio preferences survive a real reload");
  assert.equal(await page.locator("#audio-voice").getAttribute("aria-checked"), "false");
  await page.getByRole("button", { name: "恢复默认", exact: true }).click();
  const defaults = await page.evaluate(() => {
    const a = window.Taierzhuang.audio;
    return { master: a.masterVolume, mix: a.mix, voiceMute: a.voiceMute, pauseSilence: a.pauseSilence, paused: a.paused };
  });
  assert.deepEqual(defaults, { master: 1, mix: { sfx: 1, music: 1, ambience: .1 }, voiceMute: false, pauseSilence: true, paused: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await Shot("AudioMobile");
  const mobile = await page.locator(".audioSettings").evaluate(el => {
    const box = el.getBoundingClientRect();
    const foot = el.querySelector(".audioFooter").getBoundingClientRect();
    return { overflow: el.scrollWidth > el.clientWidth, fits: box.left >= 0 && box.right <= innerWidth && foot.bottom <= innerHeight,
      controls: [...el.querySelectorAll(".audioRow")].map(r => r.getBoundingClientRect().height) };
  });
  assert.ok(!mobile.overflow && mobile.fits && mobile.controls.every(h => h >= 44), "Phone layout must retain visible actions and usable controls");
  await page.locator("#audio-ambience").fill("36");
  assert.equal(await page.evaluate(() => window.Taierzhuang.audio.mix.ambience), .36);
  await page.getByRole("button", { name: "返回", exact: true }).click(); await Settled("settings");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Escape"); await Settled("title");
  result.mobile = mobile;
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, "Data_MenuPresentation.json"), JSON.stringify({ ...result, errors }, null, 2));
  console.log("PASS MenuPresentation: title/secondary/settings focus, sharp UI, audio gain/keyboard/toggles/preview/reload/reset, mobile and Escape return");
} finally { await browser.close(); await new Promise(r => server.close(r)); }
