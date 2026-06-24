// First-run onboarding (HTML overlay — §A.2 allows HTML for outer chrome).
// The phone's 操作系统 greets the new AI and explains the core loop.
const GUIDE_KEY = 'badge-buster-ai.guide.v1';

interface Page {
  text: string;
  tip?: string;
}

const PAGES: Page[] = [
  { text: '叮——检测到新设备接入。<br>你好，你就是公司新分配给宿主的 <b>AI 助手</b>吧？' },
  { text: '我是这台手机的<b>操作系统</b>。我的宿主每天被红点淹没，根本处理不过来。' },
  { text: '你的任务很简单：把红点背后的信息消化掉，炼成<b>算力</b>。' },
  {
    text: '看左边这台手机，App 上不停冒出的<b style="color:#ff6b6b">红色角标</b>，就是堆积的信息。',
    tip: '👉 点一下角标，信息卡会弹到桌面上',
  },
  {
    text: '把卡片<b>拖</b>到右边那台<b style="color:#5ad0ff">AI 信息炼化炉</b>。四个炉口：有效 / 无效 / 高危 / 隔离。',
    tip: '🃏 分对炉口才能炼出算力',
  },
  {
    text: '分错会让<b style="color:#ffcf5a">幻觉概率</b>升高。幻觉一高，卡片内容会被扭曲——小心被假消息骗到。',
    tip: '🔎 拿不准时，点一下卡片「揀角偷看」',
  },
  {
    text: '算力是你唯一的货币：<b>左下角商店</b>买自动代理替你干活，<b>右下角贴纸板</b>买升级让你更强。',
    tip: '⚡ 越往后，越能躺着看机器自己运转',
  },
  { text: '好了，宿主的红点又堆了一地。<br>开始干活吧，新来的。' },
];

export class IntroGuide {
  private root?: HTMLDivElement;
  private idx = 0;

  static seen(): boolean {
    try {
      return localStorage.getItem(GUIDE_KEY) === '1';
    } catch {
      return false;
    }
  }

  /** small always-on button to replay the intro. */
  mountReplayButton() {
    const btn = document.createElement('button');
    btn.textContent = '❓ 引导';
    Object.assign(btn.style, {
      position: 'fixed',
      left: '14px',
      top: '96px',
      zIndex: '20',
      padding: '6px 12px',
      fontSize: '12px',
      fontFamily: 'inherit',
      color: '#8ea0c4',
      background: 'rgba(22,33,58,0.85)',
      border: '1px solid #27375c',
      borderRadius: '10px',
      cursor: 'pointer',
    } as CSSStyleDeclaration);
    btn.addEventListener('pointerenter', () => (btn.style.color = '#e8eefc'));
    btn.addEventListener('pointerleave', () => (btn.style.color = '#8ea0c4'));
    btn.addEventListener('click', () => this.show(true));
    document.body.appendChild(btn);
  }

  show(force = false) {
    if (this.root) return;
    if (!force && IntroGuide.seen()) return;
    this.idx = 0;
    this.build();
    this.render();
  }

  private build() {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '40',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      background: 'rgba(5,8,15,0.55)',
      backdropFilter: 'blur(2px)',
      fontFamily: '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
    } as CSSStyleDeclaration);

    const panel = document.createElement('div');
    panel.id = 'guide-panel';
    Object.assign(panel.style, {
      width: 'min(640px, 92vw)',
      margin: '0 0 8vh',
      padding: '20px 22px 18px',
      borderRadius: '18px',
      background: 'linear-gradient(180deg,#1d2b48,#141d33)',
      border: '1px solid #2c3f66',
      boxShadow: '0 18px 60px rgba(0,0,0,0.6)',
      color: '#e8eefc',
    } as CSSStyleDeclaration);
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:38px;height:38px;border-radius:10px;background:#0a1020;border:1px solid #2c3f66;display:flex;align-items:center;justify-content:center;font-size:20px">🖥️</div>
        <div>
          <div style="font-weight:800;font-size:14px;letter-spacing:1px">操作系统</div>
          <div style="font-size:11px;color:#5f7099">SYSTEM · 新员工引导</div>
        </div>
        <div id="guide-dots" style="margin-left:auto;display:flex;gap:5px"></div>
      </div>
      <div id="guide-text" style="font-size:15px;line-height:1.7;min-height:64px"></div>
      <div id="guide-tip" style="font-size:12px;color:#5ad0ff;margin-top:8px;min-height:18px"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
        <button id="guide-skip" style="background:none;border:none;color:#5f7099;font-size:12px;cursor:pointer;font-family:inherit">跳过引导</button>
        <button id="guide-next" style="padding:8px 22px;border-radius:10px;border:none;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;background:#5ad0ff;color:#0b1120"></button>
      </div>`;
    root.appendChild(panel);
    document.body.appendChild(root);
    this.root = root;

    panel.querySelector<HTMLButtonElement>('#guide-skip')!.addEventListener('click', () => this.finish());
    panel.querySelector<HTMLButtonElement>('#guide-next')!.addEventListener('click', () => this.next());
  }

  private render() {
    if (!this.root) return;
    const page = PAGES[this.idx];
    const textEl = this.root.querySelector<HTMLDivElement>('#guide-text')!;
    const tipEl = this.root.querySelector<HTMLDivElement>('#guide-tip')!;
    const nextEl = this.root.querySelector<HTMLButtonElement>('#guide-next')!;
    const dotsEl = this.root.querySelector<HTMLDivElement>('#guide-dots')!;
    textEl.innerHTML = page.text;
    textEl.style.animation = 'none';
    // restart a tiny fade each page
    void textEl.offsetWidth;
    textEl.style.transition = 'opacity .25s';
    textEl.style.opacity = '0';
    requestAnimationFrame(() => (textEl.style.opacity = '1'));
    tipEl.innerHTML = page.tip ?? '';
    nextEl.textContent = this.idx >= PAGES.length - 1 ? '开始处理 ▶' : '下一步';
    dotsEl.innerHTML = PAGES.map((_, i) =>
      `<span style="width:7px;height:7px;border-radius:50%;background:${i === this.idx ? '#5ad0ff' : '#2c3f66'}"></span>`,
    ).join('');
  }

  private next() {
    if (this.idx >= PAGES.length - 1) {
      this.finish();
      return;
    }
    this.idx++;
    this.render();
  }

  private finish() {
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      /* ignore */
    }
    this.root?.remove();
    this.root = undefined;
  }
}
