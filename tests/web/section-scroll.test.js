import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SectionGesture } from '../../studio/section-scroll.js';
test('one wheel burst plus momentum advances exactly one section', () => {
 const gesture = new SectionGesture();
 assert.equal(gesture.take(100,0),1);
 for(let t=10;t<1000;t+=20) assert.equal(gesture.take(40,t),0);
 assert.equal(gesture.take(100,1300),1);
 assert.equal(gesture.take(-100,1800),-1);
});
test('small trackpad deltas accumulate without triggering on incidental movement', () => {
 const gesture=new SectionGesture();
 assert.equal(gesture.take(2,0),0); assert.equal(gesture.take(3,10),0);
 assert.equal(gesture.take(4,20),1); assert.equal(gesture.take(400,30),0);
});
