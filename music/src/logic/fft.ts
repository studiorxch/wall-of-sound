// Shared FFT (0712_MUSIC_BPM_Key_Detection_Engine §5 "shared analysis frames").
// Radix-2 Cooley-Tukey, power-of-2 sizes only. Extracted from
// dspFeatureExtraction.ts so the BPM/key detectors reuse the same transform
// instead of each implementing their own — one FFT, several consumers.

export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const wReal = Math.cos(-2 * Math.PI / len);
    const wImag = Math.sin(-2 * Math.PI / len);
    for (let i = 0; i < n; i += len) {
      let curReal = 1, curImag = 0;
      for (let j = 0; j < half; j++) {
        const uR = real[i + j], uI = imag[i + j];
        const tR = real[i + j + half] * curReal - imag[i + j + half] * curImag;
        const tI = real[i + j + half] * curImag + imag[i + j + half] * curReal;
        real[i + j]        = uR + tR; imag[i + j]        = uI + tI;
        real[i + j + half] = uR - tR; imag[i + j + half] = uI - tI;
        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }
}

export function magnitudeSpectrum(frame: Float32Array, fftSize: number): Float32Array {
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  const n = Math.min(frame.length, fftSize);
  // Hann window
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    real[i] = frame[i] * w;
  }
  fft(real, imag);
  const half = fftSize / 2;
  const mags = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    mags[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return mags;
}
