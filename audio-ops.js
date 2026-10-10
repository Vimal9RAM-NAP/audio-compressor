let currentFile = null;
let compressedAudioBlob = null;
let decodedAudioBuffer = null;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const dropContent = document.getElementById('dropContent');
const trackInfo = document.getElementById('trackInfo');
const trackName = document.getElementById('trackName');
const trackMeta = document.getElementById('trackMeta');

const bitrateSelect = document.getElementById('bitrateSelect');
const channelSelect = document.getElementById('channelSelect');

const origSizeEl = document.getElementById('origSize');
const compSizeEl = document.getElementById('compSize');
const savedRatioEl = document.getElementById('savedRatio');

const compressBtn = document.getElementById('compressBtn');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');
const audioPreview = document.getElementById('audioPreview');
const playerWrapper = document.getElementById('playerWrapper');
const placeholderText = document.getElementById('placeholderText');
const canvas = document.getElementById('waveformCanvas');

dropZone.addEventListener('click', (e) => {
  if (e.target !== fileInput) fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleAudioFile(e.target.files[0]);
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

['dragleave', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, () => dropZone.classList.remove('drag-over'));
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length > 0) {
    handleAudioFile(e.dataTransfer.files[0]);
  }
});

async function handleAudioFile(file) {
  if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|m4a|flac|aac)$/i)) {
    alert('Please select a valid audio file.');
    return;
  }

  currentFile = file;
  dropContent.hidden = true;
  trackInfo.hidden = false;
  trackName.textContent = file.name;

  origSizeEl.textContent = formatBytes(file.size);
  compSizeEl.textContent = '0 KB';
  savedRatioEl.textContent = '0%';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    decodedAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const durationSec = decodedAudioBuffer.duration;
    const mins = Math.floor(durationSec / 60);
    const secs = Math.floor(durationSec % 60).toString().padStart(2, '0');
    trackMeta.textContent = `Duration: ${mins}:${secs} | ${decodedAudioBuffer.numberOfChannels} Ch | ${decodedAudioBuffer.sampleRate} Hz`;

    drawWaveform(decodedAudioBuffer);
    placeholderText.hidden = true;
    playerWrapper.hidden = false;

    audioPreview.src = URL.createObjectURL(file);
    compressBtn.disabled = false;
  } catch (err) {
    console.error(err);
    alert('Failed to parse audio file.');
  }
}

function drawWaveform(buffer) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#10b981';

  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[i * step + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }
}

compressBtn.addEventListener('click', async () => {
  if (!decodedAudioBuffer) return;

  compressBtn.disabled = true;
  compressBtn.textContent = 'Compressing Audio...';

  try {
    const targetBitrate = parseInt(bitrateSelect.value, 10);
    const targetChannels = parseInt(channelSelect.value, 10);

    const mp3Blob = await encodeMp3(decodedAudioBuffer, targetChannels, targetBitrate);
    compressedAudioBlob = mp3Blob;

    audioPreview.src = URL.createObjectURL(mp3Blob);
    updateStats(currentFile.size, mp3Blob.size);
    downloadAudioBtn.disabled = false;
  } catch (err) {
    console.error(err);
    alert('Audio compression failed.');
  } finally {
    compressBtn.disabled = false;
    compressBtn.textContent = 'Compress Audio';
  }
});

function encodeMp3(audioBuffer, numChannels, bitrate) {
  return new Promise((resolve) => {
    const sampleRate = audioBuffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrate);
    const mp3Data = [];

    const samplesL = convertFloat32ToInt16(audioBuffer.getChannelData(0));
    const samplesR = numChannels === 2 && audioBuffer.numberOfChannels > 1
      ? convertFloat32ToInt16(audioBuffer.getChannelData(1))
      : samplesL;

    const sampleBlockSize = 1152;
    for (let i = 0; i < samplesL.length; i += sampleBlockSize) {
      const leftChunk = samplesL.subarray(i, i + sampleBlockSize);
      let mp3buf;

      if (numChannels === 2) {
        const rightChunk = samplesR.subarray(i, i + sampleBlockSize);
        mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      } else {
        mp3buf = mp3encoder.encodeBuffer(leftChunk);
      }

      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);

    resolve(new Blob(mp3Data, { type: 'audio/mp3' }));
  });
}

function convertFloat32ToInt16(buffer) {
  let l = buffer.length;
  const buf = new Int16Array(l);
  while (l--) {
    const s = Math.max(-1, Math.min(1, buffer[l]));
    buf[l] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buf;
}

function updateStats(origBytes, compBytes) {
  origSizeEl.textContent = formatBytes(origBytes);
  compSizeEl.textContent = formatBytes(compBytes);

  const savedPercent = (((origBytes - compBytes) / origBytes) * 100).toFixed(1);
  savedRatioEl.textContent = `${savedPercent > 0 ? '-' : '+'}${Math.abs(savedPercent)}%`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

downloadAudioBtn.addEventListener('click', () => {
  if (!compressedAudioBlob) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(compressedAudioBlob);
  link.download = `audissor-${Date.now()}.mp3`;
  link.click();
});