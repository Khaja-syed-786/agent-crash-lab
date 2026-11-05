// Strict supported SemVer tag grammar; never pass unchecked event text into a shell.
import {pathToFileURL} from 'node:url';
export function parseReleaseTag(tag){
  if(typeof tag!=='string'||tag.length>200)throw Error('Unsupported version tag');
  const match=/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(tag);
  if(!match||match[0]!==tag||match[4]?.split('.').some(v=>/^[0-9]+$/.test(v)&&v.length>1&&v.startsWith('0')))throw Error('Unsupported version tag');
  return {tag,prerelease:!!match[4]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3)throw Error('Expected exactly one version tag');
  const value=parseReleaseTag(process.argv[2]);
  console.log(`prerelease=${value.prerelease}`);
}
