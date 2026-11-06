import {Progress,validateProgress} from './Rules';
export const SAVE_FORMAT='bridgeheaddefender';
export const MAX_SAVE_BYTES=65536;
export interface SaveFile {format:typeof SAVE_FORMAT;fileVersion:1;gameVersion:string;savedAt:string;progress:Progress;}
export function makeSaveFile(progress:Progress,gameVersion:string):SaveFile{
 return {format:SAVE_FORMAT,fileVersion:1,gameVersion,savedAt:new Date().toISOString(),progress:{...progress}};
}
// Accept the current portable envelope and the already-shipped raw v1 save.
// Imports reject unsupported/future formats and out-of-range data instead of
// silently turning an invalid file into a fresh or truncated game.
export function readSaveFile(text:string):{progress:Progress;savedAt:string|null}|null{
 if(text.length>MAX_SAVE_BYTES)return null;
 try{
  const data=JSON.parse(text.replace(/^\uFEFF/,''));
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  const wrapped='format' in data||'fileVersion' in data||'progress' in data;
  if(wrapped&&(data.format!==SAVE_FORMAT||data.fileVersion!==1))return null;
  const raw=wrapped?data.progress:data,p=validateProgress(raw);
  if(!p||Object.keys(p).some(k=>k!=='muted'&&p[k as keyof Progress]!==raw[k]))return null;
  if(typeof raw.muted!=='boolean')return null;
  const savedAt=wrapped&&typeof data.savedAt==='string'&&Number.isFinite(Date.parse(data.savedAt))?data.savedAt:null;
  return {progress:p,savedAt};
 }catch{return null;}
}
