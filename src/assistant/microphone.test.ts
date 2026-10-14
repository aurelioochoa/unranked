import { afterEach, describe, expect, it, vi } from 'vitest'
const fake = vi.hoisted(()=>({request:vi.fn().mockResolvedValue({text:'',pending:''})}))
vi.mock('./cactus',()=>({cactusReady:()=>true,cactus:()=>({request:fake.request})}))
import { startMicrophone } from './microphone'
const options={language:'en',continuous:false,onPartial:vi.fn(),onFinal:vi.fn(),onSpeech:vi.fn(),onError:vi.fn()}
afterEach(()=>vi.unstubAllGlobals())
describe('microphone error cleanup',()=>{
  it('does not request microphone access on an insecure origin',async()=>{
    const getUserMedia=vi.fn();vi.stubGlobal('window',{isSecureContext:false});vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}})
    await expect(startMicrophone(options)).rejects.toThrow(/HTTPS/);expect(getUserMedia).not.toHaveBeenCalled()
  })
  it('explains denied permissions',async()=>{
    vi.stubGlobal('window',{isSecureContext:true,AudioWorkletNode:class{}});vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockRejectedValue(new DOMException('Denied','NotAllowedError'))}})
    await expect(startMicrophone(options)).rejects.toThrow(/permission was denied/)
  })
  it('releases an acquired microphone if the audio engine cannot start',async()=>{
    const stop=vi.fn();vi.stubGlobal('window',{isSecureContext:true,AudioWorkletNode:class{}});vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockResolvedValue({getTracks:()=>[{stop}]})}})
    vi.stubGlobal('AudioContext',class{constructor(){throw new Error('Audio unavailable')}})
    await expect(startMicrophone(options)).rejects.toThrow(/Local audio could not start/);expect(stop).toHaveBeenCalledOnce()
  })
})

it('keeps long speech streaming and never executes before silence or explicit finalization',async()=>{
  fake.request.mockClear();let port: {onmessage: ((event:{data:Float32Array})=>void)|null;close:()=>void}
  class Worklet {
    port={onmessage:null as ((event:{data:Float32Array})=>void)|null,close:vi.fn()}
    constructor(){port=this.port}
    connect(target:unknown){return target}
    disconnect(){}
  }
  const stop=vi.fn();vi.stubGlobal('window',{isSecureContext:true,AudioWorkletNode:Worklet});vi.stubGlobal('AudioWorkletNode',Worklet)
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockResolvedValue({getTracks:()=>[{stop}]})}})
  vi.stubGlobal('AudioContext',class{
    state='running';audioWorklet={addModule:async()=>{}};destination={}
    async resume(){};async close(){this.state='closed'}
    createMediaStreamSource(){return{connect:(node:unknown)=>node}}
    createGain(){return{gain:{value:1},connect:(target:unknown)=>target}}
  })
  const finalized=vi.fn();const session=await startMicrophone({...options,onFinal:finalized})
  for(let i=0;i<251;i++)port!.onmessage!({data:new Float32Array(1600).fill(0.03)})
  await new Promise(resolve=>setTimeout(resolve,10))
  expect(fake.request.mock.calls.every(call=>call[0]==='audio')).toBe(true);expect(finalized).not.toHaveBeenCalled()
  await session.stop();expect(stop).toHaveBeenCalledOnce()
})

it('keeps consecutive hands-free utterances separate while inference is queued',async()=>{
  fake.request.mockImplementation(async(type:string,args?:{pcm:Float32Array})=>({text:type==='audio'&&args?.pcm.some(v=>v>0.01) ? args.pcm.some(v=>v>0.05) ? 'second' : 'first' : '',pending:''}))
  let port: {onmessage:((event:{data:Float32Array})=>void)|null;close:()=>void}
  class Worklet {port={onmessage:null as ((event:{data:Float32Array})=>void)|null,close:vi.fn()};constructor(){port=this.port};connect(target:unknown){return target};disconnect(){}}
  vi.stubGlobal('window',{isSecureContext:true,AudioWorkletNode:Worklet});vi.stubGlobal('AudioWorkletNode',Worklet)
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockResolvedValue({getTracks:()=>[{stop:vi.fn()}]})}})
  vi.stubGlobal('AudioContext',class{state='running';audioWorklet={addModule:async()=>{}};destination={};async resume(){};async close(){this.state='closed'};createMediaStreamSource(){return{connect:(node:unknown)=>node}};createGain(){return{gain:{value:1},connect:(target:unknown)=>target}}})
  const finalized=vi.fn();const session=await startMicrophone({...options,continuous:true,onFinal:finalized})
  for(const amplitude of [0.03,0.06]){for(let i=0;i<10;i++)port!.onmessage!({data:new Float32Array(1600).fill(amplitude)});for(let i=0;i<9;i++)port!.onmessage!({data:new Float32Array(1600)})}
  await new Promise(resolve=>setTimeout(resolve,10));expect(finalized.mock.calls.map(call=>call[0])).toEqual(['first','second'])
  await session.stop()
})
