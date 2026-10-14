/* Fractional resampling averages source samples into 16 kHz mono frames. */
class SageCapture extends AudioWorkletProcessor {
  constructor() { super(); this.sum = 0; this.count = 0; this.phase = 0; this.block = []; }
  process(inputs) {
    const channels = inputs[0]; if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let mono = 0; for (const channel of channels) mono += channel[i] || 0;
      this.sum += mono / channels.length; this.count++; this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.block.push(this.sum / this.count); this.phase -= sampleRate; this.sum = 0; this.count = 0;
        if (this.block.length === 1600) { const pcm = new Float32Array(this.block); this.port.postMessage(pcm, [pcm.buffer]); this.block = []; }
      }
    }
    return true;
  }
}
registerProcessor('sage-capture', SageCapture);
