import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retainedSegments, editDuration, sourceToEdited, editedToSource, editChannels, editPulseTimes } from '../../studio/audio-edit.js';
test('trim and overlapping interior cuts produce ordered non-overlapping kept ranges', () => {
 const ranges=retainedSegments(20,2,18,[[10,13],[7,11],[0,3],[17,20]]);
 assert.deepEqual(ranges,[[3,7],[13,17]]);assert.equal(editDuration(ranges),8);
 assert.throws(()=>retainedSegments(10,8,2));assert.throws(()=>retainedSegments(10,0,10,[[0,10]]));
});
test('preview seeks map across cuts and skip removed positions', () => {
 const ranges=[[2,5],[8,10]];
 assert.equal(editedToSource(ranges,0),2);assert.equal(editedToSource(ranges,3),8);
 assert.equal(sourceToEdited(ranges,6),3);assert.equal(sourceToEdited(ranges,10),5);
 assert.equal(editedToSource(ranges,5),10);
});
test('export preserves both channels and exact edited sample order', () => {
 const channels=[Float32Array.from([0,1,2,3,4,5,6,7]),Float32Array.from([10,11,12,13,14,15,16,17])];
 const edited=editChannels(channels,2,[[.5,1.5],[2.5,4]]);
 assert.deepEqual([...edited[0]],[1,2,5,6,7]);assert.deepEqual([...edited[1]],[11,12,15,16,17]);
 assert.deepEqual([...channels[0]],[0,1,2,3,4,5,6,7]);
 assert.deepEqual(editPulseTimes([0,1,2,3,4,5,6],[[1,3],[5,7]]),[0,1,2,3]);
});
