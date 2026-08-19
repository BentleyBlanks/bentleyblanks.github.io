# 战地 BF1 / BFV 枪械实测数值（datamine + 官方原话）

> 来源：sym.gg 的 `BF1WeaponNameToData`（159 支）与 `BFVWeaponNameToData`（82 支）
> —— 直接从页面 JS 全局变量里读出来的**出货原值**（非渲染表格抓取）；
> 加 DICE 动画师 Oskar Wetterbrandt 的官方博文、BF1 音频团队访谈。
> 标注：[实测]=datamine ｜ [文档]=sym.gg 模型 ｜ [推算]=按公式复算 ｜ [官方]=DICE 原话 ｜ [查无]

## 一、六个该照着建的数字

1. **栓动步枪垂直后坐：BF1 开镜 2.0°、腰射 5.0°，水平 ±1.0°**；
   **BFV Kar98k 4.0°，水平 ±0.1°** —— BFV 把水平砍了 10 倍，栓动几乎是纯垂直的。[实测]
   BF1 整个栓动族**共用一个后坐值**，平衡全靠射速/初速/伤害，不靠后坐。
   马提尼-亨利是唯一的异类（10°）。
2. **后坐永远回到零，没有残留。** 0.25—0.5 s 内收干净，而两发间隔是 1.0—2.4 s。
   **每一发都从同一个瞄准点开始。** [文档 + 推算]
3. **回落是"先慢后快"**：公式里有 `TimeSinceLastShot^0.5` 因子，t=0 时该项为 0，
   所以**回落从零速率起步、然后加速**。踢上去 → 悬住 → 加速归位。
   **这条曲线本身就是"重量感"的来源**，不是残留。[文档]
4. **重力 12 m/s²（不是 9.8），二次阻力 a = v²×0.0025，弹丸寿命 5 s。** [实测]
   全部 159 支 BF1 与 82 支 BFV 武器**共用这一个重力常数**。
   Gewehr 98（880 m/s）：300 m 下坠 **1.40 m**，飞行 0.53 s，**只剩 45% 初速**。
5. **开镜的 FOV 过渡是全局固定 150 ms**（`AimingFovTransitionTime` 82 支全是 0.15，
   `AimingFovDelay` 全是 0）。**每支枪的开镜手感差异全在动画（ZoomPose）里，不在相机。** [实测]
6. **开镜时把 LAG 支点挪到照门。** DICE 原话：腰射时支点在肩，枪在屏幕上甩得有性格；
   开镜时"we move the pivot to the front sight of the weapon **so we don't mess with the players aim**"。
   —— 视觉后坐与实际瞄准分离的全部诀窍就是这一句。[官方]

## 二、回落公式（逐帧、逐轴）[文档]

```
RecoilTerm = ((abs(CurrentRecoil) / 0.5)^0.6 + .001)
Decrease   = RecoilTerm * RecoilDecrease * DeltaTime * TimeSinceLastShot^0.5 * C   // C ≈ 5.0
NewRecoil  = CurrentRecoil ∓ Decrease
```

推算（60 Hz，C=5.0）：Gewehr 98（2.0° 踢、RecoilDec 4.5）0.10 s 回 51%、**0.25 s 回 100%**。
带瞄具的变体 RecoilDec 从 4.5 降到 3.0 —— **装镜子的代价是回得更慢**。

## 三、栓动的节奏（比后坐更重要的一条）[社区/Wiki]

BF1 里**拉栓会强制退出瞄准镜**。例外只有 Gewehr M.95 与 Ross MkIII（直拉枪机）。
所以栓动的节奏是：**开火 → 强制丢失瞄准画面 → 拉栓 → 重新找目标**。
> 这一下"丢失瞄准画面"对栓动步枪的分量，比那 2° 后坐大得多。

每发间隔 [实测]：Gewehr 98 **1.200 s** ｜ Kar98k **1.250 s** ｜
三八式 1.053 s ｜ 马提尼-亨利 2.400 s。

## 四、装填可打断，而且能从断点续 [官方]

DICE 原话：动画里埋了若干 **enter point**，"if you decide to maybe throw a grenade or
if you're switching to your sidearm when you've already pulled the magazine out,
we don't want the soldier to start over from the beginning"。
另有两个收尾分支：冲刺时走 `1P.Early.Branch`（枪直接落到冲刺姿）、
站定时走 `1P.End.Branch`（多一段回到待机的沉降）。

Kar98k 分段 [实测]：ReloadDelay 1.2333 + StripReloadTime 1.4667 + PostReloadDelay 1.0667
= **3.767 s**，与 Wiki 实测值逐毫秒吻合。单发路径另有 SingleBulletReloadTime 0.5、
FirstSingleBulletTime 1.0333、BridgeDelay 0.5333。

## 五、首发倍率 [实测]

**每一支栓动步枪的 FSRM 与 FSSM 都是 1.0** —— 没有任何首发惩罚。
这套倍率是专门用来惩罚自动武器点射的（Automatico FSRM 2.0 / FSSM 6）。

## 六、压制 [文档]

压制球半径 **2.2 m**（绕头部），`HighThreshold` **0.54**（54% 以下无惩罚，之后线性）。
栓动枪满压制惩罚：**最小散布 +0.5°、垂直后坐 +50%、水平后坐 +100%**。

## 七、声音：远近是两套录音，不是同一段调音量 [官方]

BF1 音频团队原话：
> "Before, we had modeled the distance to a sound with filters.
> **Now we can record the same event from several distances and just crossfade between them.**"

还有：同一把枪"in a forest, in a concrete room, or out in an open field"是三种声音，
所以是按**距离 + 环境 + 角度 + 射速**在引擎里现场拼装。
HDR Audio 覆盖约 130 dB，设计哲学是 **play the right sounds, not all sounds**。

**[查无]**：DICE 从未公布"一声枪响几层"。常见的
transient/body/mechanical/tail 四层说法是行业通例，**不是 DICE 的说法**，别安在它头上。

## 八、查不到的（诚实列出）

- 每支枪的开镜秒数：sym.gg 明说不在游戏数据里，社区表在 forum.sym.gg，该站不可达且无存档
- BFV 冲刺开火的**基准**时间（只有每枪倍率：手枪 0.40 / 冲锋枪 0.5333 /
  突击步枪 0.80 / **栓动 0.9333** / 轻机枪 1.20 / 中型机枪 1.60）
- 开镜过冲作为可调参数——没找到，且 DICE 的书面规矩反对它
  （"quick bumps that re-center quickly. **Avoid floating camera**"）
- BFV「视觉后坐削弱」补丁：**查无实据**。有据可查的视觉后坐争议是 BF2042 S7（2024），
  可能是记混了。5.2 那次是伤害衰减重做，不是视觉后坐；那个「+25% 垂直/+60% 水平」
  是**单枪（M1928A1）**的改动，被误传成全局。
