import { minecraftFixture, hash } from './minecraft'
export function fabricFixture() {
  const base = minecraftFixture(), loaderVersion = '0.16.0', childId = `fabric-loader-${loaderVersion}-${base.release.id}`
  const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${base.release.id}/${loaderVersion}/profile/json`
  const libraryUrl = `https://maven.fabricmc.net/net/fabricmc/fabric-loader/${loaderVersion}/fabric-loader-${loaderVersion}.jar`
  const library = Buffer.from('fixture Fabric loader library')
  const profile = { id:childId,inheritsFrom:base.release.id,mainClass:'net.fabricmc.loader.impl.launch.knot.KnotClient',type:'release',time:'2026-01-01T00:00:00Z',releaseTime:'2026-01-01T00:00:00Z',libraries:[{name:`net.fabricmc:fabric-loader:${loaderVersion}`,url:'https://maven.fabricmc.net/'}],arguments:{game:[],jvm:['-cp','${classpath}']} }
  base.files.set(profileUrl,Buffer.from(JSON.stringify(profile)))
  base.files.set(`https://meta.fabricmc.net/v2/versions/loader/${base.release.id}`,Buffer.from(JSON.stringify([{loader:{version:loaderVersion,stable:true}},{loader:{version:'99-beta',stable:false}}])))
  base.files.set(libraryUrl,library);base.files.set(libraryUrl+'.sha1',Buffer.from(hash(library)))
  return {...base,loaderVersion,childId,profileUrl,libraryUrl,profile}
}
