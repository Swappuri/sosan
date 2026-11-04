import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spectrumPass } from '../../studio/spectrum-pass.js';
test('512 wave segments use at most 12 blurred strokes and retain every crisp segment', () => {
 const strokes=[], curves=[];
 const ctx={canvas:{width:854},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(...args){curves.push(args);},stroke(){strokes.push(this.shadowBlur);}};
 const pass=spectrumPass(ctx,1,1);
 for(let i=0;i<512;i++)pass.draw({color:'#59ff9b',level:.5,position:i/512,start:[i,0],control:[i,1],end:[i+1,0]});
 pass.finish();
 assert.equal(strokes.filter(n=>n>0).length,12);
 assert.equal(strokes.filter(n=>n===0).length,512);
 assert.equal(curves.length,1024);
 assert.equal(ctx.shadowBlur,0);
});
test('disabled glow uses no blurred strokes or extra drawing pass', () => {
 const strokes=[];const ctx={canvas:{width:854},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes.push(this.shadowBlur);}};
 const pass=spectrumPass(ctx,1,0);
 pass.draw({color:'#fff',level:1,position:0,start:[0,0],end:[1,1]});pass.finish();
 assert.deepEqual(strokes,[0]);
});
