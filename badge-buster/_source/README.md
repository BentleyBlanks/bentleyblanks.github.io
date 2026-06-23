# 噩梦角标清除铺 · Badge Buster Shop

一款 2D 放置 / 增量（idle / incremental）网页小游戏：经营一家清除手机红色角标的铺子。
顾客上门 → 接过手机 → 戳 / 滑清掉 App 角标 → 擦净归还赚取小费与经验 → 升级 / 解锁魔法技能 → 招学徒自动清 → 应付越来越多越来越脏的手机。

> 此 `_source/` 目录是完整 TypeScript 源码，仅用于存档，**不对外发布**（GitHub Pages 的 Jekyll 默认忽略 `_` 前缀目录）。
> 线上可玩版本是上一级目录里 `vite build` 的产物（`../index.html` + `../assets/`），访问 `/badge-buster/` 即可。

## 架构

事件驱动 + 模块隔离。单一 `GameState` 为唯一数据源，模块间只通过 `EventBus`（`src/types/events.types.ts`）收发事件 + 读共享状态通信，每个状态字段只有一个属主模块可写。

```
src/
  types/      冻结的契约：state / events / content / assets / module 类型 + layout 几何
  bus.ts      同步派发的类型安全事件总线
  content/    纯数据：图标 / 升级 / 技能 / 顾客 / 平衡公式 / 资产清单
  core/       状态内核：角标生成、TAP/SWIPE 清除落地、存读档（唯一改 badge 者）
  shop/       顾客生命周期：到店 / 排队 / 耐心 / 情绪 / 结算 / 声誉
  economy/    经济：经验 / 等级 / 金币 / 升级 / 派生数值(derived)
  skills/     魔法技能：一键擦净 / 冻结 / 安抚 / 多手 / 双倍 / 磁吸
  automation/ 学徒机器人自动清角标
  render/     Canvas2D 渲染 + 粒子特效（美术全程序化绘制）
  input/      指针 点/滑 识别 → TAP/SWIPE
  ui/         HUD / 升级商店抽屉 / 技能栏（DOM 覆盖层，逻辑 960×640 等比缩放）
  audio/      Web Audio 合成音效 + 轻量 BGM（无外部音频文件）
  main.ts     装配模块 + 主循环
```

美术（程序化 Canvas 绘制）与音频（Web Audio 合成）均无外部二进制资产，游戏完全自包含。

## 开发 / 构建

```bash
npm install
npm run dev      # 本地开发服务器
npm run build    # 产物输出到 dist/，再拷到上一级目录发布
```

`vite.config.ts` 中 `base: './'`，保证子目录（`/badge-buster/`）下相对路径可用。

## 测试

`smoke.ts`（纯模拟循环断言）与 `dom-smoke.ts`（jsdom 下启动全部 9 个模块、跑帧、断言无异常）为无浏览器冒烟测试，可用 esbuild 打包后 node 运行。
