// Tiny one-time teaching toast (HTML overlay — §A.2 allows HTML for outer
// chrome). Used to explain a mechanic the first time the player actually hits
// it (e.g. the first 故障卡), which is far stickier than front-loading it all in
// the intro. Each key fires at most once per browser.
const PREFIX = 'badge-buster-ai.toast.';

export function toastOnce(key: string, title: string, body: string) {
  try {
    if (localStorage.getItem(PREFIX + key) === '1') return;
    localStorage.setItem(PREFIX + key, '1');
  } catch {
    /* storage blocked — still show it once this session */
  }
  showToast(title, body);
}

let stackY = 0;

function showToast(title: string, body: string) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: `${24 + stackY}px`,
    transform: 'translateX(-50%) translateY(20px)',
    zIndex: '50',
    maxWidth: 'min(520px, 92vw)',
    padding: '14px 18px',
    borderRadius: '14px',
    background: 'linear-gradient(180deg,#fff6e3,#f1e2bd)',
    border: '2px solid #c69a4c',
    boxShadow: '0 14px 40px rgba(40,24,8,0.45)',
    color: '#33271a',
    fontFamily: '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
    opacity: '0',
    transition: 'opacity .3s, transform .3s',
  } as CSSStyleDeclaration);
  el.innerHTML = `
    <div style="font-weight:800;font-size:14px;margin-bottom:4px">${title}</div>
    <div style="font-size:13px;line-height:1.6;color:#5b4a31">${body}</div>`;
  document.body.appendChild(el);
  stackY += 92;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });
  const kill = () => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => {
      el.remove();
      stackY = Math.max(0, stackY - 92);
    }, 320);
  };
  el.addEventListener('click', kill);
  setTimeout(kill, 6200);
}
