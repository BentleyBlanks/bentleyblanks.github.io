// 玩法时间的唯一入口（docs/Data_SandboxRanges.md §3）：谁要慢放、暂停、单步，就往这里登记一个缩放器，用完撤掉。
//
// 以前五个来源（白刃 QTE、断肢 / 炮击扬尘 / 人物反应三个测试场、编辑器的持枪检查）各自在 Script_Main.Frame
// 开头写一行改 dt，加一种慢动作就要改装配层，几个同时生效时谁先谁后也只能读代码猜。
// 现在 Frame 开头只有一句 `clock.Step(realDt)`；先后由登记时给的 order 决定（与原来那五行的顺序一致）。
//
// `realDt` 一直留着：QTE 的按键窗口、编辑器面板这类东西要走真实时间，不跟着慢。纯逻辑，零 three。

/** 登记顺序（小的先算）。原 Frame 开头五行的顺序：白刃 QTE → 测试场 → 编辑器。 */
export const CLOCK_ORDER = Object.freeze({ meleeQte: 10, sandbox: 20, editor: 50 });

export class GameClock {
  constructor() {
    this.scalers = [];
    this.realDt = 0;
    this.dt = 0;
  }

  /**
   * 登记一个缩放器 `fn(dt) → dt`（同名先撤掉旧的）。返回撤销函数。
   * 缩放器可以返回 0（暂停）或与输入无关的固定步长（单步）。
   */
  Add(id, fn, order = 0) {
    this.Remove(id);
    this.scalers.push({ id, fn, order });
    this.scalers.sort((a, b) => a.order - b.order);
    return () => this.Remove(id);
  }

  Remove(id) {
    const index = this.scalers.findIndex((s) => s.id === id);
    if (index >= 0) this.scalers.splice(index, 1);
  }

  Has(id) { return this.scalers.some((s) => s.id === id); }

  /** 推进一帧：返回这一帧的玩法时间。 */
  Step(realDt) {
    let dt = realDt;
    for (const s of this.scalers) dt = s.fn(dt);
    this.realDt = realDt;
    this.dt = dt;
    return dt;
  }

  /** 调试口：这一帧的真实 / 玩法时间与当前登记的缩放器。 */
  State() {
    return { realDt: this.realDt, dt: this.dt, scalers: this.scalers.map((s) => ({ id: s.id, order: s.order })) };
  }
}
