import { describe, expect, it } from 'vitest'
import { WorkerClient } from './workerClient'
class FakeWorker {
  onmessage: ((event: {data:unknown})=>void) | null = null
  onerror: ((event: {message:string})=>void) | null = null
  message: {id:string;type:string} | null = null
  terminated=false
  postMessage(message: {id:string;type:string}) { this.message=message }
  terminate(){this.terminated=true}
}
describe('speech worker lifecycle',()=>{
  it('delivers progress separately from typed results',async()=>{
    const worker=new FakeWorker();const client=new WorkerClient(worker as unknown as Worker);let progress=0
    const result=client.request<{ready:boolean}>('load',{},value=>{progress=value})
    worker.onmessage!({data:{id:worker.message!.id,progress:0.5,label:'Model'}});expect(progress).toBe(0.5)
    worker.onmessage!({data:{id:worker.message!.id,value:{ready:true}}});expect(await result).toEqual({ready:true})
  })
  it('rejects pending calls on worker failure and refuses further calls',async()=>{
    const worker=new FakeWorker();const client=new WorkerClient(worker as unknown as Worker);const result=client.request('audio')
    worker.onerror!({message:'WASM failed'});await expect(result).rejects.toThrow(/WASM failed/)
    expect(client.closed).toBe(true);expect(worker.terminated).toBe(true);await expect(client.request('audio')).rejects.toThrow(/reload/)
  })
})
