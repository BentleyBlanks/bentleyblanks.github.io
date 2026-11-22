import { FLOW_DIALOGUE } from "./Data_LevelFlow.mjs";
import { FLOW_SPEECH_HUD as HUD } from "../../Data_Tuning_LevelFlow.mjs";
import { Clamp } from "./Script_LevelFlowGeometry.mjs";

export function SampleFlowDialogue(beat, time, actors, dialogueTable = FLOW_DIALOGUE) {
  const quotes = [...beat.passage.matchAll(/[「“]([^」”]+)[」”]/gu)].map(match => match[1]);
  return (dialogueTable[beat.id] || []).flatMap((cue, index) => {
    const start = beat.start + cue.at, end = Math.min(beat.end, start + cue.duration);
    if (time < start || time >= end) return [];
    const actor = actors.find(entry => cue.actor ? entry.id === cue.actor : entry.groupId === cue.group && entry.pose !== "dead");
    const text = cue.text || quotes[cue.quote];
    if (!actor || actor.pose === "dead" || !text) return [];
    return [{id:`${beat.id}_${index}`, actorId:actor.id, name:cue.name || actor.name, text, start, end}];
  });
}

export function SpeechHeadHeight(actor) {
  return HUD.headHeight[actor.pose] ?? HUD.headHeight[actor.kind] ?? HUD.headHeight.person;
}

function WrapSpeech(context, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const character of text) {
    if (character === "\n" || line && context.measureText(line + character).width > maxWidth) {
      lines.push(line);
      line = "";
    }
    if (character !== "\n") line += character;
  }
  if (line) lines.push(line);
  return lines;
}

// Drawing into each viewport's canvas keeps captures and PNG exports identical
// to playback. Font size stays in CSS pixels as the world camera moves.
export function DrawFlowDialogue(context, view, frame, width, height, drawBillboard=null) {
  const bubbles = [];
  for (const speech of frame.dialogue || []) {
    const actor = frame.actors.find(entry => entry.id === speech.actorId);
    if (!actor || view.VisibleActor && !view.VisibleActor(actor)) continue;
    const anchor = view.SpeechAnchor(actor);
    if (!anchor || anchor[0] < 0 || anchor[0] > width || anchor[1] < 0 || anchor[1] > height) continue;
    const opacityFn = view.SpeechOpacity || view.ActorLabelOpacity;
    const opacity = !drawBillboard && opacityFn ? opacityFn.call(view, actor) : 1;
    if (opacity <= 0) continue;
    context.save();
    context.globalAlpha = opacity;
    context.font = `${HUD.fontSize}px sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "top";
    const maxWidth = Math.max(HUD.fontSize, Math.min(HUD.maxWidth, width - HUD.margin * 2) - HUD.padding * 2);
    const lines = WrapSpeech(context, speech.text, maxWidth);
    const contentWidth = Math.max(context.measureText(speech.name).width, ...lines.map(line => context.measureText(line).width));
    const boxWidth = Math.min(width - HUD.margin * 2, contentWidth + HUD.padding * 2);
    const boxHeight = HUD.padding * 2 + HUD.nameHeight + lines.length * HUD.lineHeight;
    const left = Clamp(anchor[0] - boxWidth / 2, HUD.margin, width - HUD.margin - boxWidth);
    const above = anchor[1] - HUD.headGap - HUD.tailHeight - boxHeight;
    const desiredTop = above >= HUD.margin ? above : anchor[1] + HUD.headGap + HUD.tailHeight;
    const top = Clamp(desiredTop, HUD.margin, Math.max(HUD.margin, height - HUD.margin - boxHeight));
    const tailAtBottom = top + boxHeight / 2 < anchor[1];
    const edgeY = tailAtBottom ? top + boxHeight : top;
    const tailX = Clamp(anchor[0], left + HUD.cornerRadius + 6, left + boxWidth - HUD.cornerRadius - 6);
    const PaintBody=(ctx,x,y)=>{
      ctx.textAlign="left";ctx.textBaseline="top";
      ctx.fillStyle = HUD.fill;
      ctx.strokeStyle = HUD.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, HUD.cornerRadius);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = HUD.nameColor;
      ctx.font = "12px sans-serif";
      ctx.fillText(speech.name, x + HUD.padding, y + HUD.padding);
      ctx.fillStyle = HUD.ink;
      ctx.font = `${HUD.fontSize}px sans-serif`;
      lines.forEach((line, index) => ctx.fillText(line, x + HUD.padding, y + HUD.padding + HUD.nameHeight + index * HUD.lineHeight));
    };
    if(drawBillboard) {
      drawBillboard(actor,speech,lines,[left,top,boxWidth,boxHeight],PaintBody,
        {x:tailX,edgeY,tipX:anchor[0],tipY:anchor[1]-HUD.headGap,fill:HUD.fill,outline:HUD.outline});
    } else {
      PaintBody(context,left,top);context.fillStyle=HUD.fill;context.strokeStyle=HUD.outline;context.lineWidth=2;
      context.beginPath();
      context.moveTo(tailX - 7, edgeY);
      context.lineTo(anchor[0], anchor[1] - HUD.headGap);
      context.lineTo(tailX + 7, edgeY);
      context.fill();
      context.stroke();
      context.strokeStyle = HUD.fill;
      context.beginPath();
      context.moveTo(tailX - 6, edgeY);
      context.lineTo(tailX + 6, edgeY);
      context.stroke();
    }
    context.restore();
    bubbles.push({...speech, anchor, box:[left, top, boxWidth, boxHeight], opacity, lines});
  }
  return bubbles;
}
