const fs = require('node:fs');
const path = require('node:path');

const sampleRate = 11_025;
const durationSeconds = 60;
const supportedBpms = [160, 165, 170, 175, 180];
const beepFrames = Math.round(sampleRate * 0.085);

for (const beatsPerMinute of supportedBpms) {
  const sampleCount = sampleRate * durationSeconds;
  const dataBytes = sampleCount * 2;
  const fileName = beatsPerMinute === 180
    ? 'metronome-click.wav'
    : `metronome-${beatsPerMinute}.wav`;
  const outputPath = path.join(__dirname, '..', 'assets', 'audio', fileName);
  const wav = Buffer.alloc(44 + dataBytes);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);

  const framesPerBeat = sampleRate * durationSeconds / beatsPerMinute;
  for (let beat = 0; beat < beatsPerMinute; beat += 1) {
    const beatStart = Math.round(beat * framesPerBeat);
    for (let frame = 0; frame < beepFrames; frame += 1) {
      const attack = Math.min(1, frame / (sampleRate * 0.002));
      const decay = Math.exp(-frame / (sampleRate * 0.035));
      const beep = Math.sin((2 * Math.PI * 880 * frame) / sampleRate)
        + 0.18 * Math.sin((2 * Math.PI * 1_760 * frame) / sampleRate);
      const sample = Math.max(-1, Math.min(1, beep * attack * decay * 0.92));
      const offset = 44 + (beatStart + frame) * 2;
      if (offset + 1 < wav.length) wav.writeInt16LE(Math.round(sample * 32_767), offset);
    }
  }

  fs.writeFileSync(outputPath, wav);
  process.stdout.write(`Generated ${beatsPerMinute} metronome beeps in 60 seconds at ${outputPath}\n`);
}
