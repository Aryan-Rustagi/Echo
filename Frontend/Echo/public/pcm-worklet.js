class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    const length = channelData.length;
    const int16Array = new Int16Array(length);

    for (let i = 0; i < length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      int16Array[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }

    this.port.postMessage(int16Array.buffer, [int16Array.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
