import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReleaseTag} from '../scripts/release-tag.js';
for(const tag of ['v0.1.0','v1.2.3','v1.2.3+build.01','v1.2.3-rc.1','v1.2.3-alpha-beta+build.1'])test(`supported release tag ${tag}`,()=>assert.deepEqual(parseReleaseTag(tag),{tag,prerelease:tag.split('+')[0].includes('-')}));
for(const tag of ['1.2.3','v1','v1.2','v01.2.3','v1.02.3','v1.2.03','v1.2.3-01','v1.2.3-rc.01','v1.2.3-','v1.2.3+','v1.2.3-a..b','v1.2.3\n','v1.2.3;echo bad','v1.2.3/branch','v1.2.3_foo',null])test(`reject malformed tag ${JSON.stringify(tag)}`,()=>assert.throws(()=>parseReleaseTag(tag)));

test('tag validator rejects actual line terminators and oversized names',()=>{for(const tag of ['v1.2.3'+String.fromCharCode(10),'v1.2.3'+String.fromCharCode(13),'v1.2.3-'+ 'a'.repeat(201)])assert.throws(()=>parseReleaseTag(tag));});
