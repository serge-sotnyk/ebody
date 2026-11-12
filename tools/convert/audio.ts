// Original sounds (.u8) are headerless unsigned 8-bit mono PCM.
// PyElectroMan ships them as 16-bit WAV at 8000 Hz with sample = (u8 ^ 0x80) << 8;
// we produce the same, so the files can be compared byte for byte.
// The true playback rate of the original is not documented (see docs/fidelity.md).

export const SAMPLE_RATE = 8000;

export function u8ToWav(u8: Uint8Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const dataSize = u8.length * 2;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < u8.length; i++) {
    out[44 + i * 2] = 0;
    out[44 + i * 2 + 1] = u8[i]! ^ 0x80;
  }
  return out;
}
