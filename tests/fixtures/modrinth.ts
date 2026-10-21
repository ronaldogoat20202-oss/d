import { createHash } from 'node:crypto'
export function modrinthFixture() {
  const bytes=Buffer.from('fixture addon'), sha512=createHash('sha512').update(bytes).digest('hex')
  const version=(id:string,project='main',dependencies:unknown[]=[])=>({id,project_id:project,name:id,date_published:'2026-01-01T00:00:00Z',game_versions:['1.21.1'],loaders:['fabric'],files:[{filename:id+'.jar',url:`https://cdn.modrinth.com/data/${project}/${id}.jar`,size:bytes.length,hashes:{sha512},primary:true}],dependencies})
  const records=new Map<string,unknown>([
    ['/project/main',{id:'main',title:'Main mod',description:'A mod',project_type:'mod'}],
    ['/project/dep',{id:'dep',title:'Dependency',description:'A dependency',project_type:'mod'}],
    ['/project/main/version',[version('main-v1','main',[{project_id:'dep',version_id:null,dependency_type:'required'}])]],
    ['/project/dep/version',[version('dep-v1','dep')]],
    ['/version/main-v1',version('main-v1','main',[{project_id:'dep',version_id:null,dependency_type:'required'}])],
    ['/version/dep-v1',version('dep-v1','dep')]
  ])
  const requested:string[]=[]
  const fetcher=async(url:string)=>{requested.push(url);const parsed=new URL(url),path=parsed.pathname.replace('/v2','');if(path==='/search')return Response.json({hits:[{project_id:'main',title:'Main mod',description:'Plain text',project_type:'mod'}],offset:Number(parsed.searchParams.get('offset')||0),limit:10,total_hits:1});const value=records.get(path);return value?Response.json(value):new Response('',{status:404})}
  return {bytes,sha512,version,records,requested,fetcher}
}
