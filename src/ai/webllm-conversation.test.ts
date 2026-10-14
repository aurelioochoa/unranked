import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fake=vi.hoisted(()=>({create:vi.fn(),cached:vi.fn(),generate:vi.fn(),interrupt:vi.fn(),unload:vi.fn()}))
vi.mock('@mlc-ai/web-llm',()=>({CreateMLCEngine:fake.create,hasModelInCache:fake.cached,prebuiltAppConfig:{model_list:[{model_id:'small',overrides:{context_window_size:1024}}]}}))
beforeEach(()=>{vi.resetModules();fake.create.mockReset();fake.cached.mockReset();fake.generate.mockReset();fake.interrupt.mockReset();fake.unload.mockReset();vi.stubGlobal('navigator',{gpu:{}});fake.cached.mockResolvedValue(true);fake.create.mockResolvedValue({chat:{completions:{create:fake.generate}},interruptGenerate:fake.interrupt,unload:fake.unload})})
afterEach(()=>vi.unstubAllGlobals())
describe('WebLLM conversation adapter',()=>{
  it('requires an explicit cached download before conversation',async()=>{
    fake.cached.mockResolvedValue(false);const {streamWebLlmConversation}=await import('./webllm')
    await expect(async()=>{for await(const _ of streamWebLlmConversation('small',[],new AbortController().signal)){} }).rejects.toThrow(/Download/)
    expect(fake.create).not.toHaveBeenCalled()
  })
  it('streams locally and respects the selected small model budget',async()=>{
    async function* chunks(){yield{choices:[{delta:{content:'Hola.'}}]}}fake.generate.mockResolvedValue(chunks())
    const {streamWebLlmConversation,webLlmContextWindow}=await import('./webllm');let text=''
    for await(const piece of streamWebLlmConversation('small',[],new AbortController().signal))text+=piece
    expect(text).toBe('Hola.');expect(await webLlmContextWindow('small')).toBe(1024);expect(fake.generate.mock.calls[0]![0].max_tokens).toBe(256)
  })
  it('interrupts generation on caller cancellation',async()=>{
    const controller=new AbortController();async function* chunks(){yield{choices:[{delta:{content:'First.'}}]};controller.abort();yield{choices:[{delta:{content:'Late.'}}]}}fake.generate.mockResolvedValue(chunks())
    const {streamWebLlmConversation}=await import('./webllm')
    await expect(async()=>{for await(const _ of streamWebLlmConversation('small',[],controller.signal)){} }).rejects.toThrow()
    expect(fake.interrupt).toHaveBeenCalledOnce()
  })
  it('permits a retry after a failed model download',async()=>{
    fake.create.mockRejectedValueOnce(new Error('Download failed'));const {loadEngine}=await import('./webllm')
    await expect(loadEngine('small')).rejects.toThrow(/Download failed/);await expect(loadEngine('small')).resolves.toBeTruthy()
    expect(fake.create).toHaveBeenCalledTimes(2)
  })
})
