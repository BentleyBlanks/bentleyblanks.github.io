// Screenshot markup shared from the local character production workbench.
const dialog = document.querySelector('#screenshotDialog');
const Element = id => document.getElementById(id);
const stage = Element('screenshotStage');
const canvas = Element('screenshotCanvas');
const context = canvas.getContext('2d');
const text = Element('screenshotText');
const attach = Element('attachScreenshot');
const file = Element('screenshotFile');
const tools = [...dialog.querySelectorAll('[data-mark]')];
const color = '#e33d35';
let source, save, tool, marks, history, undone, stroke, textPoint, editingText, saving, revision = 0;

function Status(message = '') {
  const output = Element('screenshotStatus');
  output.textContent = message;
  output.hidden = !message;
}

function TextLayout(start,value) {
  const size = Math.max(16, Math.round(22 * Math.max(canvas.width, canvas.height) / 960));
  const lineHeight = Math.ceil(size * 1.2);
  const lines = value.split('\n');
  context.font = `bold ${size}px sans-serif`;
  const width = Math.min(canvas.width, Math.max(...lines.map(line=>context.measureText(line).width)));
  const height = Math.min(canvas.height, lines.length * lineHeight);
  return {size, lineHeight, lines, width, height,
          x: Math.max(0, Math.min(start.x, canvas.width - width - 2)),
          y: Math.max(0, Math.min(start.y, canvas.height - height - 2))};
}

function Draw(mark) {
  const {kind, start, end, points, value} = mark;
  const unit = Math.max(canvas.width, canvas.height) / 960;
  context.lineWidth = Math.max(2, 3 * unit);
  context.strokeStyle = context.fillStyle = color;
  context.lineCap = context.lineJoin = 'round';
  if (kind === 'rect') {
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (kind === 'text') {
    const box = TextLayout(start,value);
    context.textBaseline = 'top';
    context.strokeStyle = '#fff';
    for(const [i,line] of box.lines.entries()) {
      const y = box.y + i * box.lineHeight;
      context.strokeText(line,box.x,y,canvas.width-box.x);
      context.fillText(line,box.x,y,canvas.width-box.x);
    }
  } else {
    context.beginPath();
    context.moveTo(start.x, start.y);
    if (kind === 'brush') {
      if (points.length === 1) context.lineTo(start.x + 0.01, start.y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    } else {
      context.lineTo(end.x, end.y);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const size = Math.min(16 * unit, Math.hypot(end.y - start.y, end.x - start.x) * 0.5);
      for (const side of [-1, 1]) {
        context.moveTo(end.x, end.y);
        context.lineTo(end.x - size * Math.cos(angle + side * 0.55), end.y - size * Math.sin(angle + side * 0.55));
      }
    }
    context.stroke();
  }
}

function Paint() {
  if (source) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const mark of marks) if(mark !== editingText) Draw(mark);
    if (stroke) Draw(stroke);
  }
  for (const button of tools) {
    button.disabled = !source || saving;
    button.setAttribute('aria-pressed', String(tool === button.dataset.mark));
  }
  attach.disabled = !source || saving;
  Element('importScreenshot').disabled = saving;
  Element('undoMark').disabled = !history?.length || saving;
  Element('redoMark').disabled = !undone?.length || saving;
}

function Fit() {
  if (!source || !dialog.open) return;
  const scale = Math.min((stage.clientWidth - 16) / canvas.width, (stage.clientHeight - 16) / canvas.height, 1);
  canvas.style.width = Math.max(1, canvas.width * scale) + 'px';
  canvas.style.height = Math.max(1, canvas.height * scale) + 'px';
  PositionText();
}

function SetSource(image) {
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  if (!width || !height) throw Error('图片尚未载入。');
  const scale = Math.min(1, 2560 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext('2d').drawImage(canvas, 0, 0);
  source = snapshot;
  marks = []; history = []; undone = []; stroke = null;
  FinishText(false);
  Element('screenshotEmpty').hidden = true;
  Element('screenshotSheet').hidden = false;
  Fit();
  Paint();
}

export function OpenScreenshot(image, onAttach, initialFile) {
  ++revision;
  save = onAttach; tool = 'rect'; source = null; marks = []; history = []; undone = []; stroke = null; saving = false;
  FinishText(false);
  Status();
  Element('screenshotEmpty').hidden = false;
  Element('screenshotSheet').hidden = true;
  dialog.showModal();
  try { if (image) SetSource(image); }
  catch (error) { Status(error.message); }
  Paint();
  if (initialFile) Import(initialFile);
}

async function Import(imageFile) {
  if (!imageFile || saving) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageFile.type) || imageFile.size > 32 * 1024 * 1024) {
    Status('请选择不超过 32 MB 的 PNG、JPEG 或 WebP 图片。');
    return;
  }
  const ticket = ++revision;
  const url = URL.createObjectURL(imageFile);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (ticket === revision && dialog.open && !saving) { SetSource(image); Status(); }
  } catch { if (ticket === revision && dialog.open) Status('无法读取这张图片。'); }
  finally { URL.revokeObjectURL(url); }
}

function Point(event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * canvas.width,
    y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) * canvas.height
  };
}

function PositionText() {
  if (!textPoint) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = width/canvas.width;
  const box = TextLayout(textPoint,text.value || text.placeholder);
  const editorWidth = Math.min(width,Math.max(100,Math.ceil(box.width*scale)+16));
  const lineHeight = Math.max(16,box.lineHeight*scale);
  const editorHeight = Math.min(height,Math.ceil(box.lines.length*lineHeight)+8);
  Object.assign(text.style,{
    width:editorWidth+'px', height:editorHeight+'px',
    left:Math.max(0,Math.min(width-editorWidth,box.x*scale-4))+'px',
    top:Math.max(0,Math.min(height-editorHeight,box.y*scale-2))+'px',
    fontSize:Math.max(14,box.size*scale)+'px', lineHeight:lineHeight+'px',
  });
}

function ApplyChange(change,redo) {
  const before = redo ? change.before : change.after;
  const after = redo ? change.after : change.before;
  marks.splice(change.index,before ? 1 : 0,...(after ? [after] : []));
}

function Add(mark,before) {
  const change = {index:before ? marks.indexOf(before) : marks.length, before, after:mark};
  ApplyChange(change,true);
  history.push(change);
  undone = [];
}

function FinishText(commit) {
  const start = textPoint, before = editingText, value = text.value.trim();
  textPoint = null;
  editingText = null;
  text.hidden = true;
  text.value = '';
  if (commit && start && (value || before) && value !== before?.value) {
    Add(value ? {kind:'text',start,value} : null,before);
  }
}

function History(redo) {
  if (saving || stroke) return;
  FinishText(true);
  const from = redo ? undone : history, to = redo ? history : undone;
  if (from.length) {
    const change = from.pop();
    ApplyChange(change,redo);
    to.push(change);
  }
  Paint();
}

canvas.addEventListener('pointerdown', event => {
  if (!source || saving || stroke || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  FinishText(true);
  const start = Point(event);
  if (tool === 'text') {
    editingText = marks.findLast(mark=>{
      if(mark.kind!=='text')return false;
      const box=TextLayout(mark.start,mark.value);
      return start.x>=box.x && start.x<=box.x+box.width && start.y>=box.y && start.y<=box.y+box.height;
    });
    textPoint = editingText?.start ?? start;
    text.value = editingText?.value ?? '';
    text.hidden = false;
    PositionText();
    text.focus({preventScroll:true});
  } else {
    canvas.setPointerCapture(event.pointerId);
    stroke = {kind: tool, start, end: start, points: [start], pointer: event.pointerId};
  }
  Paint();
});
function Extend(event) {
  const next = Point(event);
  if (stroke.kind === 'brush' && (next.x !== stroke.end.x || next.y !== stroke.end.y)) stroke.points.push(next);
  stroke.end = next;
}
canvas.addEventListener('pointermove', event => {
  if (stroke?.pointer !== event.pointerId) return;
  Extend(event);
  Paint();
});
canvas.addEventListener('pointerup', event => {
  if (stroke?.pointer !== event.pointerId) return;
  Extend(event);
  if (stroke.kind === 'brush' || Math.hypot(stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y) > 2) Add(stroke);
  stroke = null;
  Paint();
});
for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
  if (stroke?.pointer === event.pointerId) { stroke = null; Paint(); }
});

new ResizeObserver(Fit).observe(stage);
text.addEventListener('input', PositionText);
text.addEventListener('blur', () => { FinishText(true); Paint(); });
text.addEventListener('keydown', event => {
  if (event.isComposing || !(event.key === 'Escape' || event.key === 'Enter' && (event.ctrlKey || event.metaKey))) return;
  event.preventDefault();
  event.stopPropagation();
  FinishText(true);
  Paint();
});
stage.addEventListener('contextmenu',event=>{
  if(!textPoint)return;
  event.preventDefault();
  FinishText(true);
  Paint();
});
for (const button of tools) button.onclick = () => { FinishText(true); tool = button.dataset.mark; Paint(); };
Element('closeScreenshot').onclick = () => dialog.close();
Element('undoMark').onclick = () => History(false);
Element('redoMark').onclick = () => History(true);
Element('importScreenshot').onclick = () => file.click();
file.onchange = () => { Import(file.files[0]); file.value = ''; };
dialog.addEventListener('paste', event => {
  const image = [...event.clipboardData.files].find(item => item.type.startsWith('image/'));
  if (image) { event.preventDefault(); Import(image); }
});
dialog.addEventListener('keydown', event => {
  if (event.target !== text && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault(); History(event.shiftKey || event.key.toLowerCase() === 'y');
  }
});
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  ++revision;
  source = null; save = null; marks = []; history = []; undone = []; stroke = null;
  FinishText(false);
  canvas.width = canvas.height = 1;
});
attach.onclick = async () => {
  if (!source || saving || stroke) return;
  FinishText(true);
  saving = true;
  const ticket = ++revision, onAttach = save;
  Paint(); Status('正在保存截图…');
  try {
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!image) throw Error('无法生成截图。');
    if (ticket !== revision || !dialog.open) return;
    const commit = await onAttach(image);
    if (ticket !== revision || !dialog.open) return;
    dialog.close();
    commit();
  } catch (error) { if (ticket === revision) Status(error.message); }
  finally { if (ticket === revision && dialog.open) { saving = false; Paint(); } }
};
