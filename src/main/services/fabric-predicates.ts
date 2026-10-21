import { compare,valid } from 'semver'
function normalized(value:string):string {
  const match=/^(\d+)(?:\.(\d+))?(?:\.(\d+))?([+-].+)?$/.exec(value)
  const result=match?`${match[1]}.${match[2]||'0'}.${match[3]||'0'}${match[4]||''}`:null
  if(!result||!valid(result))throw new Error(`Unsupported Fabric version syntax: ${value}`)
  return result
}
export function matchesFabricVersion(version:string,predicate:string|string[]):boolean {
  if(Array.isArray(predicate)){const results=predicate.map(p=>matchesFabricVersion(version,p));return results.some(Boolean)}
  if(typeof predicate!=='string'||predicate.length>1024||!predicate.trim())throw new Error('Unsupported Fabric dependency predicate.')
  return predicate.trim().split(/\s+/).map(term=>{
    if(term==='*'||term==='x')return true
    const match=/^(>=|<=|>|<|=|~|\^)?(.+)$/.exec(term)!,op=match[1]||'=',wanted=match[2]
    if(/(?:^|\.)(?:x|\*)$/.test(wanted)){
      if(op!=='=')throw new Error('Unsupported Fabric wildcard predicate.')
      const prefix=wanted.split('.').slice(0,-1);if(!prefix.every(p=>/^\d+$/.test(p))||prefix.length>2)throw new Error('Unsupported Fabric wildcard predicate.')
      const current=normalized(version).split(/[.+-]/).slice(0,3);return prefix.every((p,i)=>Number(p)===Number(current[i]))
    }
    const a=normalized(version),b=normalized(wanted),order=compare(a,b)
    if(op==='=')return order===0;if(op==='>')return order>0;if(op==='>=')return order>=0;if(op==='<')return order<0;if(op==='<=')return order<=0
    const left=a.split('.'),right=b.split('.');return order>=0&&left[0]===right[0]&&(op==='^'||left[1]===right[1])
  }).every(Boolean)
}
