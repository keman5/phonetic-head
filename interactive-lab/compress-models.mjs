import assert from 'node:assert/strict';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {brotliCompressSync,brotliDecompressSync,gzipSync,gunzipSync,constants} from 'node:zlib';

const directory=process.argv[2];
assert(directory,'Usage: node compress-models.mjs <staged assets directory>');
const models=(await readdir(directory)).filter(name=>name.endsWith('.glb')).sort();
assert(models.length>0,'No GLB assets found');
for(const name of models){
 const path=join(directory,name),source=await readFile(path);
 assert.equal(source.readUInt32LE(0),0x46546c67,name+': invalid GLB');
 assert.equal(source.readUInt32LE(8),source.length,name+': truncated GLB');
 const brotli=brotliCompressSync(source,{params:{[constants.BROTLI_PARAM_QUALITY]:7}});
 const gzip=gzipSync(source,{level:9});
 await writeFile(path+'.br',brotli);await writeFile(path+'.gz',gzip);
 assert((brotliDecompressSync(await readFile(path+'.br'))).equals(source),name+': Brotli round trip changed bytes');
 assert((gunzipSync(await readFile(path+'.gz'))).equals(source),name+': gzip round trip changed bytes');
 assert(brotli.length<source.length,name+': compression did not reduce size');
 console.log(`${name}: ${source.length} bytes -> br ${brotli.length}, gzip ${gzip.length} (lossless verified)`);
}
