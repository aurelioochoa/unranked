import { afterEach, describe, expect, it, vi } from 'vitest'
import { serverConversation } from './providers'
import { preferencesSchema } from './schema'
import { sameOrigin, jsonBody } from './http'
import { readEvents } from './client'
afterEach(()=>vi.unstubAllGlobals())
describe('streaming and request boundaries',()=>{
  it('streams Ollama with thinking disabled and handles a final unterminated line',async()=>{
    const fetcher=vi.fn(async(_url: unknown, _options: RequestInit)=>new Response('{"message":{"content":"Report. "}}\n{"message":{"content":"Ready."}}'))
    vi.stubGlobal('fetch',fetcher)
    let out='';for await(const text of serverConversation(preferencesSchema.parse({})).stream([{role:'user',content:'Hello'}],new AbortController().signal))out+=text
    expect(out).toBe('Report. Ready.');expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).think).toBe(false)
  })
  it('cancels without calling a cloud provider',async()=>{
    const fetcher=vi.fn(async(_url:unknown, options:RequestInit)=>{options.signal?.throwIfAborted();return new Response('')});vi.stubGlobal('fetch',fetcher)
    const controller=new AbortController();controller.abort()
    await expect(async()=>{for await(const _ of serverConversation(preferencesSchema.parse({})).stream([],controller.signal)){} }).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects absent or cross-origin mutation origins and oversized bodies',async()=>{
    expect(()=>sameOrigin(new Request('http://localhost/test',{headers:{origin:'https://evil.test'}}))).toThrow()
    expect(()=>sameOrigin(new Request('http://localhost/test'))).toThrow()
    expect(()=>sameOrigin(new Request('http://localhost/test',{headers:{origin:'http://localhost','sec-fetch-site':'same-origin'}}))).not.toThrow()
    await expect(jsonBody(new Request('http://localhost/test',{method:'POST',body:'x'.repeat(65537)}))).rejects.toThrow(/too large/)
  })
  it('parses typed stream events across byte and line boundaries',async()=>{
    const body=new ReadableStream({start(c){for(const chunk of ['{"type":"te','xt","text":"Hola"}\n','{"type":"done"}'])c.enqueue(new TextEncoder().encode(chunk));c.close()}})
    const events=[];for await(const event of readEvents(new Response(body)))events.push(event)
    expect(events).toEqual([{type:'text',text:'Hola'},{type:'done'}])
  })
})

it('aborts provider work when the response stream is cancelled',async()=>{
  const {eventStream}=await import('./http');let cancelled=false
  const response=eventStream(async(_send,signal)=>{await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{cancelled=true;resolve()},{once:true}))})
  await response.body!.cancel();expect(cancelled).toBe(true)
})
