/** Non-destructive edits in original-song seconds. */
export function retainedSegments(duration, start = 0, end = duration, cuts = []) {
  if (![duration, start, end].every(Number.isFinite) || duration <= 0 || start < 0 || end > duration + .001 || end <= start) throw new Error('Choose a start before the end, within the song.');
  const removed = cuts.map(([a,b]) => {
    if (![a,b].every(Number.isFinite) || a < 0 || b <= a || b > duration + .001) throw new Error('Each cut needs a start before its end, within the song.');
    return [Math.max(start,a),Math.min(end,b)];
  }).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  const result=[];let cursor=start;
  for(const [a,b] of removed){if(a>cursor)result.push([cursor,a]);cursor=Math.max(cursor,b);}
  if(cursor<end)result.push([cursor,end]);
  if(editDuration(result)<.05)throw new Error('Keep at least 0.05 seconds of audio.');
  return result;
}
export const editDuration = segments => segments.reduce((sum,[a,b])=>sum+b-a,0);
export function sourceToEdited(segments, seconds) {
  let offset=0;
  for(const [a,b] of segments){if(seconds<a)return offset;if(seconds<b)return offset+seconds-a;offset+=b-a;}
  return offset;
}
export function editedToSource(segments, seconds) {
  let remaining=Math.max(0,seconds);
  for(const [a,b] of segments){if(remaining<b-a-1e-8)return a+remaining;remaining-=b-a;}
  return segments.at(-1)?.[1] ?? 0;
}
export function editChannels(channels, sampleRate, segments) {
  if(!segments?.length)return channels.map(channel=>channel.slice());
  const ranges=segments.map(([a,b])=>[Math.max(0,Math.round(a*sampleRate)),Math.min(channels[0].length,Math.round(b*sampleRate))]).filter(([a,b])=>b>a);
  const length=ranges.reduce((n,[a,b])=>n+Math.max(0,b-a),0);
  if(!length)throw new Error('The selected edit contains no audio.');
  return channels.map(channel=>{const output=new Float32Array(length);let offset=0;for(const[a,b]of ranges){output.set(channel.subarray(a,b),offset);offset+=b-a;}return output;});
}
export function editPulseTimes(pulses,segments){
  let offset=0;const result=[];
  for(const[a,b]of segments){for(const time of pulses)if(time>=a&&time<b)result.push(offset+time-a);offset+=b-a;}
  return result;
}
