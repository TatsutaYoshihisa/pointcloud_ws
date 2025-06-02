// gopro_360_to_bin.js
// GoPro .360 動画から GPMF バイナリを抽出して .bin に保存するスクリプト

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

console.log('🎬 GoPro .360 to BIN Extractor');
console.log('==============================');

// === パス設定 ===
const currentDir = __dirname;
const workspaceRoot = path.join(currentDir, '..', '..');
const includeDir = path.join(workspaceRoot, 'include');
const moviesDir = path.join(workspaceRoot, 'movies');
const outputDir = path.join(currentDir, 'output');

// === 入力動画ファイル名（ここを変更して他の動画にも対応可能） ===
const inputVideoName = 'GS010692.360';
const baseName = path.parse(inputVideoName).name;
const inputVideoPath = path.join(moviesDir, inputVideoName);
const outputBinPath = path.join(outputDir, `${baseName}_telemetry.bin`);

// === FFmpeg の検索 ===
const ffmpegCandidates = [
  path.join(includeDir, 'ffmpeg', 'ffmpeg'),
  path.join(includeDir, 'ffmpeg', 'bin', 'ffmpeg'),
  'ffmpeg'
];

let ffmpegPath = null;
for (const candidate of ffmpegCandidates) {
  if (candidate === 'ffmpeg' || fs.existsSync(candidate)) {
    ffmpegPath = candidate;
    break;
  }
}
if (!ffmpegPath) {
  console.error('❌ FFmpeg not found.');
  process.exit(1);
}
console.log(`✅ FFmpeg found: ${ffmpegPath}`);

// === 出力ディレクトリの確認 ===
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// === FFmpegコマンドでGPMFストリームを抽出（stream #0:3）===
console.log(`📦 Extracting telemetry stream from: ${inputVideoPath}`);
const ffmpegArgs = [
  '-y',
  '-i', inputVideoPath,
  '-codec', 'copy',
  '-map', '0:3',
  '-f', 'rawvideo',
  outputBinPath
];

const result = spawnSync(ffmpegPath, ffmpegArgs, { stdio: 'inherit' });

if (result.status !== 0) {
  console.error('❌ FFmpeg extraction failed.');
  process.exit(1);
}

console.log(`✅ Telemetry binary saved: ${outputBinPath}`);
