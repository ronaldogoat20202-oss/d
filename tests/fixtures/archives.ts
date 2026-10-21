import { crc32 } from 'node:zlib'
export function zipFixture(entries:Record<string,string|Uint8Array>):Buffer {
  const locals:Buffer[]=[],central:Buffer[]=[];let offset=0
  for(const [name,value]of Object.entries(entries)){
    const filename=Buffer.from(name),bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value),crc=crc32(bytes)
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26)
    locals.push(local,filename,bytes)
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(bytes.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);central.push(entry,filename);offset+=local.length+filename.length+bytes.length
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22),count=Object.keys(entries).length
  const extra:Buffer[]=[]
  if(count>65535){const zip64=Buffer.alloc(56),locator=Buffer.alloc(20);zip64.writeUInt32LE(0x06064b50);zip64.writeBigUInt64LE(44n,4);zip64.writeUInt16LE(45,12);zip64.writeUInt16LE(45,14);zip64.writeBigUInt64LE(BigInt(count),24);zip64.writeBigUInt64LE(BigInt(count),32);zip64.writeBigUInt64LE(BigInt(directory.length),40);zip64.writeBigUInt64LE(BigInt(offset),48);locator.writeUInt32LE(0x07064b50);locator.writeBigUInt64LE(BigInt(offset+directory.length),8);locator.writeUInt32LE(1,16);extra.push(zip64,locator)}
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Math.min(count,65535),8);end.writeUInt16LE(Math.min(count,65535),10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16)
  return Buffer.concat([...locals,directory,...extra,end])
}
