"""Local-only preview server with HTTP range support for frame seeking."""
from pathlib import Path
import http.server,functools,re,shutil
output=Path.home()/'Downloads/GVHMR/InfantryActions_20260905/Deliverables'
class PreviewHandler(http.server.SimpleHTTPRequestHandler):
 def send_head(self):
  self.remaining=None
  path=Path(self.translate_path(self.path))
  if not path.is_file():return super().send_head()
  stream=path.open('rb');size=path.stat().st_size
  match=re.fullmatch(r'bytes=(\d*)-(\d*)',self.headers.get('Range',''))
  start,end=0,size-1
  if match:
   if match[1]:start=int(match[1]);end=min(size-1,int(match[2])) if match[2] else size-1
   else:start=max(0,size-int(match[2]))
   if start>end:stream.close();self.send_error(416);return None
  self.send_response(206 if match else 200);self.send_header('Content-Type',self.guess_type(str(path)));self.send_header('Accept-Ranges','bytes')
  self.send_header('Content-Length',str(end-start+1))
  if match:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
  self.end_headers();stream.seek(start);self.remaining=end-start+1;return stream
 def copyfile(self,source,destination):
  if self.remaining is None:return shutil.copyfileobj(source,destination)
  while self.remaining>0:
   block=source.read(min(1024*1024,self.remaining))
   if not block:break
   destination.write(block);self.remaining-=len(block)
server=http.server.ThreadingHTTPServer(('127.0.0.1',8128),functools.partial(PreviewHandler,directory=str(output)))
print('http://127.0.0.1:8128/Preview_InfantryActions.html',flush=True);server.serve_forever()
