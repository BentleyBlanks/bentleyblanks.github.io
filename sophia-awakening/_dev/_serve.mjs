import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve("dist");
const MIME={".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".json":"application/json",".wav":"audio/wav",".ogg":"audio/ogg",".mp3":"audio/mpeg",".png":"image/png",".svg":"image/svg+xml"};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(ROOT,p);if(!path.resolve(f).startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end("not found");return;}res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(res);});
server.listen(5191,"127.0.0.1",()=>console.log("Sophia dev build at http://127.0.0.1:5191/"));
