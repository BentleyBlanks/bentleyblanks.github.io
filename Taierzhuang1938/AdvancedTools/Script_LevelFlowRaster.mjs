const colors=new Map();
function Rgb(color) {
  if(!colors.has(color)) colors.set(color,[parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)]);
  return colors.get(color);
}
function Edge(a,b,x,y) {return (x-a.x)*(b.y-a.y)-(y-a.y)*(b.x-a.x);}

// World triangles and actor strokes use the same depth test. This avoids
// average-face sorting and axis-aligned proxy boxes changing visibility.
export class EncounterRaster {
  constructor() {this.canvas=document.createElement("canvas");}

  Begin(width,height,perspective,coordinateScale=1) {
    width=Math.max(1,Math.round(width));height=Math.max(1,Math.round(height));
    if(this.width!==width||this.height!==height) {
      this.width=width;this.height=height;this.canvas.width=width;this.canvas.height=height;
      this.image=new ImageData(width,height);this.depth=new Float32Array(width*height);
    }
    this.perspective=perspective;this.coordinateScale=coordinateScale;
    this.displayWidth=width/coordinateScale;this.displayHeight=height/coordinateScale;
    this.depth.fill(Infinity);this.triangles=0;this.image.data.fill(0);
  }

  Triangle(a,b,c,color) {
    this.triangles++;
    const area=Edge(a,b,c.x,c.y);
    if(Math.abs(area)<0.001) return;
    const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),maxX=Math.min(this.width-1,Math.ceil(Math.max(a.x,b.x,c.x)));
    const minY=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),maxY=Math.min(this.height-1,Math.ceil(Math.max(a.y,b.y,c.y)));
    if(minX>maxX||minY>maxY) return;
    const vertexColors = !!a.rgb && !!b.rgb && !!c.rgb;
    const rgb=vertexColors ? a.rgb : Rgb(color),data=this.image.data,depth=this.depth;
    const az=this.perspective?1/a.depth:a.depth,bz=this.perspective?1/b.depth:b.depth,cz=this.perspective?1/c.depth:c.depth;
    const firstStep=(c.y-b.y)/area,secondStep=(a.y-c.y)/area;
    const firstRowStep=(b.x-c.x)/area,secondRowStep=(c.x-a.x)/area;
    const depthStep=firstStep*(az-cz)+secondStep*(bz-cz);
    const firstRow=Edge(b,c,minX+0.5,minY+0.5)/area;
    const secondRow=Edge(c,a,minX+0.5,minY+0.5)/area;
    const weights=[firstRow,secondRow,1-firstRow-secondRow];
    const steps=[firstStep,secondStep,-firstStep-secondStep];
    const rowSteps=[firstRowStep,secondRowStep,-firstRowStep-secondRowStep];
    const smooth = vertexColors && a.rgb.some((channel, axis) => channel !== b.rgb[axis] || channel !== c.rgb[axis]);
    let redA=0,greenA=0,blueA=0,redB=0,greenB=0,blueB=0,redC=0,greenC=0,blueC=0;
    let redStep=0,greenStep=0,blueStep=0;
    if(smooth) {
      const scaleA=this.perspective?az:1,scaleB=this.perspective?bz:1,scaleC=this.perspective?cz:1;
      redA=a.rgb[0]*scaleA;greenA=a.rgb[1]*scaleA;blueA=a.rgb[2]*scaleA;
      redB=b.rgb[0]*scaleB;greenB=b.rgb[1]*scaleB;blueB=b.rgb[2]*scaleB;
      redC=c.rgb[0]*scaleC;greenC=c.rgb[1]*scaleC;blueC=c.rgb[2]*scaleC;
      redStep=firstStep*(redA-redC)+secondStep*(redB-redC);
      greenStep=firstStep*(greenA-greenC)+secondStep*(greenB-greenC);
      blueStep=firstStep*(blueA-blueC)+secondStep*(blueB-blueC);
    }
    for(let y=minY;y<=maxY;y++) {
      // Each barycentric weight is linear across a row. Intersect its three
      // valid intervals so the pixel loop only visits the triangle's span.
      let from=minX,to=maxX;
      for(let edge=0;edge<3;edge++) {
        const weight=weights[edge],step=steps[edge];
        if(step>0) from=Math.max(from,minX+Math.ceil((-1e-7-weight)/step));
        else if(step<0) to=Math.min(to,minX+Math.floor((-1e-7-weight)/step));
        else if(weight<-1e-7) {to=from-1;break;}
      }
      let interpolated=weights[0]*az+weights[1]*bz+weights[2]*cz+(from-minX)*depthStep;
      const distance=from-minX;
      const rowRed=weights[0]*redA+weights[1]*redB+weights[2]*redC+distance*redStep;
      const rowGreen=weights[0]*greenA+weights[1]*greenB+weights[2]*greenC+distance*greenStep;
      const rowBlue=weights[0]*blueA+weights[1]*blueB+weights[2]*blueC+distance*blueStep;
      let index=y*this.width+from;
      for(let x=from;x<=to;x++,index++,interpolated+=depthStep) {
        const z=this.perspective?1/interpolated:interpolated;
        if(z>=depth[index]) continue;
        depth[index]=z;
        const offset=index*4;
        if (smooth) {
          const distance = x - from, scale = this.perspective ? z : 1;
          data[offset] = (rowRed + distance * redStep) * scale;
          data[offset + 1] = (rowGreen + distance * greenStep) * scale;
          data[offset + 2] = (rowBlue + distance * blueStep) * scale;
        } else {
          data[offset]=rgb[0];data[offset+1]=rgb[1];data[offset+2]=rgb[2];
        }
        data[offset+3]=255;
      }
      for(let edge=0;edge<3;edge++) weights[edge]+=rowSteps[edge];
    }
  }

  Face(vertices,color) {
    for(let index=1;index<vertices.length-1;index++) this.Triangle(vertices[0],vertices[index],vertices[index+1],color);
  }

  Flush(context,width,height) {
    this.canvas.getContext("2d").putImageData(this.image,0,0);
    context.drawImage(this.canvas,0,0,width,height);
  }

  Occluded(vertex) {
    const x=Math.round(vertex.x*this.coordinateScale),y=Math.round(vertex.y*this.coordinateScale);
    if(x<0||y<0||x>=this.width||y>=this.height) return false;
    return vertex.depth>this.depth[y*this.width+x]+0.025;
  }

  Stroke(context,a,b,color,width,stats,hiddenAlpha=0.2) {
    const dx=b.x-a.x,dy=b.y-a.y;
    let from=0,to=1;
    for(const [origin,delta,limit] of [[a.x,dx,this.displayWidth],[a.y,dy,this.displayHeight]]) {
      if(delta===0) {if(origin<-5||origin>limit+5) return;continue;}
      const first=(-5-origin)/delta,last=(limit+5-origin)/delta;
      from=Math.max(from,Math.min(first,last));to=Math.min(to,Math.max(first,last));
    }
    if(from>to) return;
    const length=Math.hypot(dx,dy)*(to-from),steps=Math.max(1,Math.ceil(length/1.5));
    let previous=null,hidden=null,lastPoint=null;
    const Paint=(end)=>{
      if(!previous) return;
      context.save();context.globalAlpha=hidden?hiddenAlpha:1;context.strokeStyle=color;context.lineWidth=width;context.lineCap="round";
      context.beginPath();context.moveTo(previous.x,previous.y);context.lineTo(end.x,end.y);context.stroke();context.restore();
    };
    for(let index=0;index<=steps;index++) {
      const t=from+(to-from)*index/steps;
      const point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
        depth:this.perspective?1/((1-t)/a.depth+t/b.depth):a.depth+(b.depth-a.depth)*t};
      if(point.x<-5||point.y<-5||point.x>this.displayWidth+5||point.y>this.displayHeight+5) {if(previous&&lastPoint) Paint(lastPoint);previous=null;hidden=null;continue;}
      const occluded=this.Occluded(point);stats[occluded?"hidden":"visible"]++;
      if(previous&&occluded!==hidden) {Paint(point);previous=point;}
      if(!previous) previous=point;
      hidden=occluded;
      lastPoint=point;
      if(index===steps) Paint(point);
    }
  }

  Head(context,point,radius,color,stats,hiddenAlpha=0.2) {
    const size=Math.ceil(radius*2+2),image=new ImageData(size,size),rgb=Rgb(color);
    const left=Math.floor(point.x-radius-1),top=Math.floor(point.y-radius-1);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const dx=left+x+0.5-point.x,dy=top+y+0.5-point.y;
      if(dx*dx+dy*dy>radius*radius) continue;
      const hidden=this.Occluded({x:left+x,y:top+y,depth:point.depth});stats[hidden?"hidden":"visible"]++;
      const offset=(y*size+x)*4;image.data[offset]=rgb[0];image.data[offset+1]=rgb[1];image.data[offset+2]=rgb[2];image.data[offset+3]=hidden?Math.round(hiddenAlpha*255):255;
    }
    const marker=this.marker||(this.marker=document.createElement("canvas"));marker.width=size;marker.height=size;
    marker.getContext("2d").putImageData(image,0,0);context.drawImage(marker,left,top);
  }

  OverlayFace(context,vertices,color,stats,hiddenAlpha=0.2) {
    const left=Math.max(0,Math.floor(Math.min(...vertices.map((point)=>point.x)))),top=Math.max(0,Math.floor(Math.min(...vertices.map((point)=>point.y))));
    const right=Math.min(this.displayWidth,Math.ceil(Math.max(...vertices.map((point)=>point.x)))),bottom=Math.min(this.displayHeight,Math.ceil(Math.max(...vertices.map((point)=>point.y))));
    if(right<=left||bottom<=top) return;
    const width=right-left,height=bottom-top,image=new ImageData(width,height),rgb=Rgb(color);
    for(let triangle=1;triangle<vertices.length-1;triangle++) {
      const a=vertices[0],b=vertices[triangle],c=vertices[triangle+1],area=Edge(a,b,c.x,c.y);
      if(Math.abs(area)<0.001) continue;
      for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
        const first=Edge(b,c,left+x+0.5,top+y+0.5)/area,second=Edge(c,a,left+x+0.5,top+y+0.5)/area,third=1-first-second;
        if(first<0||second<0||third<0) continue;
        const depth=this.perspective?1/(first/a.depth+second/b.depth+third/c.depth):first*a.depth+second*b.depth+third*c.depth;
        const hidden=this.Occluded({x:left+x,y:top+y,depth});stats[hidden?"hidden":"visible"]++;
        const offset=(y*width+x)*4;image.data[offset]=rgb[0];image.data[offset+1]=rgb[1];image.data[offset+2]=rgb[2];image.data[offset+3]=hidden?Math.round(hiddenAlpha*255):255;
      }
    }
    const marker=this.overlay||(this.overlay=document.createElement("canvas"));marker.width=width;marker.height=height;
    marker.getContext("2d").putImageData(image,0,0);context.drawImage(marker,left,top);
  }
}
