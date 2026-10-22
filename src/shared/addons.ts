export type AddonKind = 'mod'|'resourcepack'|'datapack'|'shader'
export type CatalogKind = AddonKind|'modpack'
export type CatalogSort = 'relevance'|'downloads'|'follows'|'newest'|'updated'
export interface AddonTarget { kind: AddonKind; gameVersion: string; loader:'vanilla'|'fabric' }
export interface CatalogQuery { kind:CatalogKind; query:string; gameVersion:string; offset:number; limit:number; sort?:CatalogSort }
export interface CatalogProject { id:string; name:string; description:string; kind:CatalogKind; author?:string; iconUrl?:string|null; downloads?:number; followers?:number; updatedAt?:string; categories?:string[]; clientSide?:string; serverSide?:string }
export interface CatalogProjectDetails extends CatalogProject { body:string }
export interface SearchPage { projects:CatalogProject[]; offset:number; limit:number; total:number; cached:boolean }
export interface CatalogFile { filename:string; url:string; size:number; sha512:string; primary:boolean }
export interface CatalogDependency { type:'required'|'optional'|'incompatible'|'embedded'; projectId:string|null; versionId:string|null }
export interface CatalogVersion { id:string; projectId:string; name:string; kind:AddonKind; gameVersions:string[]; loaders:string[]; files:CatalogFile[]; dependencies:CatalogDependency[]; publishedAt:string }
export type ModpackVersion = Omit<CatalogVersion,'kind'> & {kind:'modpack'}
export type ProjectVersion = CatalogVersion|ModpackVersion
export interface AddonRequest { projectId?:string; versionId?:string }
export interface ManagedAddon { id:string; kind:AddonKind; name:string; source:'modrinth'|'local'|'modpack'; projectId:string|null; versionId:string|null; relativePath:string; sha512:string; providerSize:number|null; providerSha512:string|null; enabled:boolean; worldId:string|null; dependencies:string[]; catalogDependencies?:CatalogDependency[]; compatibility:'declared'|'unverified'; gameVersion:string; loader:'vanilla'|'fabric' }
export interface AddonPlan { id:string; profileId:string; entries:{name:string;kind:AddonKind;versionId:string;bytes:number}[]; optionalDependencies:string[] }
export interface ImportPreview { id:string; profileId:string; name:string; kind:AddonKind; compatibility:'declared'|'unverified'; requiredAddons:AddonPlan['entries'] }
export interface WorldSummary { id:string; name:string }
export interface LibraryState { profileId:string; worlds:WorldSummary[]; installed:ManagedAddon[]; needsRecovery:boolean }
