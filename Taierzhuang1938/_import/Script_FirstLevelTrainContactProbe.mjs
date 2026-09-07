// Browser-only acceptance probe. Read original skin against actual level boards.
import {Vector3} from 'three';
import {MISSION_LAYOUT} from '../Data_FirstLevelMissionLayout.mjs';
const boards=MISSION_LAYOUT.blocks.filter(b=>/Bench-?\d+_-?\d+$/.test(b.id));
export function ProbeFirstLevelTrainContact(game,soldier){
 const rig=soldier.actor.characterRig,life=soldier.missionTrainLife;
 const board=boards.find(b=>Math.abs(life.seat.x-b.x)<b.w/2&&Math.abs(life.seat.z-b.z)<b.d/2);
 if(!board)throw Error('No actual train bench for '+soldier.id);
 const top=board.y+board.h/2,deck=top-.48;
 let minSole=Infinity,seatGap=Infinity,penetrating=0,deckPenetrating=0,vertices=0;
 // SkinnedMesh.updateMatrixWorld also refreshes bindMatrixInverse. Calling the
 // generic updateWorldMatrix after a moving train leaves an invisible mesh's
 // inverse at its last rendered position and invents a deformation.
 soldier.actor.root.updateMatrixWorld(true);
 rig.root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!mesh.userData.characterPbrSurface)return;
  const point=new Vector3();
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){
   mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);vertices++;
   minSole=Math.min(minSole,point.y-deck);if(point.y<deck)deckPenetrating++;
   const z=point.z-game.battlefield.trainOffsetM;
   if(Math.abs(point.x-board.x)<board.w/2&&Math.abs(z-board.z)<board.d/2){
    if(point.y>top-board.h&&point.y<top)penetrating++;
    // The same board seats several people; only the current body's vertices are queried.
    if(point.y>top-board.h)seatGap=Math.min(seatGap,point.y-top);
   }
  }
 });
 return {id:soldier.id,model:rig.modelId,kind:life.kind,size:soldier.actor.root.scale.y,animation:rig.missionTrainLifeState?.animation,
  board:board.id,rendered:soldier.actor.root.visible,deck,rootY:soldier.position.y,minSole,seatGap:Number.isFinite(seatGap)?seatGap:null,penetrating,deckPenetrating,vertices,
  rigPosition:rig.root.position.toArray(),actorQuaternion:soldier.actor.root.quaternion.toArray(),bodyPosition:soldier.actor.body.position.toArray(),
  bodyQuaternion:soldier.actor.body.quaternion.toArray(),floorOffset:rig.infantryFloorOffset,pose:rig.missionTrainLifeState,
  feet:['footL','footR'].map(s=>soldier.actor.root.worldToLocal(rig.bones[s].getWorldPosition(new Vector3())).toArray())};
}
