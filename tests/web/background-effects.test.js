import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawBackgroundEffects } from '../../studio/background-effects.js';
const names = ['nebula', 'aurora', 'constellation', 'grid', 'fireflies', 'scanlines'];
function draw(name, strength, bass = .8, time = 2) {
 const calls = [];
 const ctx = new Proxy({ createRadialGradient: (...args) => { calls.push(['gradient',...args]); return {addColorStop(){}}; } }, {get(target,key){ return target[key] ?? ((...args)=>calls.push([key,...args])); }});
 drawBackgroundEffects(ctx,854,480,{primary:'#59ff9b',secondary:'#59ff9b',[name]:true,[name+'Strength']:strength},{bass,flash:.5,travel:bass*2},time);
 return calls;
}
test('each background effect draws deterministically and zero strength draws nothing', () => {
 for(const name of names) {
  assert.deepEqual(draw(name,0), [['save'],['restore']]);
  assert.deepEqual(draw(name,100),draw(name,100));
  assert.ok(draw(name,100).length>2,name);
  assert.notDeepEqual(draw(name,100),draw(name,100,.2,3),name);
 }
});
