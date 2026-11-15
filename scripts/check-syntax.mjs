// Phase 4: cover all shipped JavaScript, including CLI utilities and tests.
// Runs without npm dependencies, tokens, Discord access, or player data.
import {readdirSync} from 'node:fs';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const EXCLUDED=new Set(['node_modules','.git','data','logs','backups','dist','coverage','.cache','legacy']);
export function discoverJavaScript(directory=root){
 const files=[];
 function visit(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
   if(entry.isSymbolicLink())continue; // don't follow links outside repository
   const file=join(dir,entry.name);
   if(entry.isDirectory()){if(!EXCLUDED.has(entry.name))visit(file);}
   else if(entry.isFile()&&/\.(?:js|mjs|cjs)$/.test(entry.name))files.push(file);
  }
 }
 visit(directory);
 return files.sort();
}
export function validateJavaScript(files=discoverJavaScript(),{node=process.execPath}={}){
 const failures=[];
 for(const file of files){
  const result=spawnSync(node,['--check',file],{encoding:'utf8',timeout:12000,maxBuffer:1024*1024});
  if(result.status!==0)failures.push({file:relative(root,file),reason:(result.stderr||result.error?.message||`exit ${result.status}`).slice(0,3000)});
 }
 return {count:files.length,failures};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {count,failures}=validateJavaScript();
 if(failures.length){
  for(const f of failures)console.error(`FAIL syntax ${f.file}: ${f.reason}`);
  console.error(`Syntax validation FAILED: ${failures.length}/${count} JavaScript files.`);
  process.exitCode=1;
}else console.log(`Validated syntax in ${count} active Discord Bot JavaScript files.`);
}
