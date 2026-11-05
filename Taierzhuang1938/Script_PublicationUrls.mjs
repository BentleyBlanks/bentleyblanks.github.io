// Small URL-only adapter for DOM images, workers and CPU fetch consumers.
// It intentionally does not import Three or start a renderer/decoder.
import {TEXTURE_IMPORT_RUNTIME} from './Data_TextureImportRuntime.mjs';
const siteBase=new URL('../',import.meta.url);
export function ResolvePublishedImageUrl(url){
  const absolute=new URL(url,globalThis.location?.href||import.meta.url);
  if(absolute.origin!==siteBase.origin||!absolute.pathname.startsWith(siteBase.pathname))return url;
  const key=decodeURIComponent(absolute.pathname.slice(siteBase.pathname.length)),entry=TEXTURE_IMPORT_RUNTIME[key];
  if(!entry?.siteRelative||key===entry.publicationOutput||key===entry.publicationUnflipped)return url;
  const output=new URL(entry.publicationOutput,siteBase);output.search=absolute.search;output.hash=absolute.hash;return output.href;
}
