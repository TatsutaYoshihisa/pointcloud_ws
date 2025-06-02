// simple_debug_ffmpeg.js - FFmpeg版デバッグツール

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const currentDir = __dirname;
const workspaceRoot = path.join(currentDir, '..', '..');
const includeDir = path.join(workspaceRoot, 'include');
const moviesDir = path.join(workspaceRoot, 'movies');
const outputDir = path.join(currentDir, 'output');

console.log('🔍 Simple FFmpeg Debug Tool');
console.log('===========================');

// 出力ディレクトリを作成
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log('✅ Created output directory');
}

// FFmpegのパスを確認
function findFFmpeg() {
    const possiblePaths = [
        path.join(includeDir, 'ffmpeg', 'ffmpeg'),
        path.join(includeDir, 'ffmpeg', 'bin', 'ffmpeg'),
        'ffmpeg'  // システムのPATH
    ];
    
    for (const ffmpegPath of possiblePaths) {
        try {
            if (ffmpegPath === 'ffmpeg' || fs.existsSync(ffmpegPath)) {
                console.log(`✅ FFmpeg found: ${ffmpegPath}`);
                return ffmpegPath;
            }
        } catch (error) {
            continue;
        }
    }
    
    console.log('❌ FFmpeg not found');
    console.log('💡 Install FFmpeg to include/ffmpeg/ or system PATH');
    return null;
}

// FFprobeのパスを確認
function findFFprobe() {
    const possiblePaths = [
        path.join(includeDir, 'ffmpeg', 'ffprobe'),
        path.join(includeDir, 'ffmpeg', 'bin', 'ffprobe'),
        'ffprobe'  // システムのPATH
    ];
    
    for (const ffprobePath of possiblePaths) {
        try {
            if (ffprobePath === 'ffprobe' || fs.existsSync(ffprobePath)) {
                console.log(`✅ FFprobe found: ${ffprobePath}`);
                return ffprobePath;
            }
        } catch (error) {
            continue;
        }
    }
    
    console.log('❌ FFprobe not found');
    return null;
}

// 動画の詳細情報を取得
async function analyzeVideo(videoPath, ffprobePath) {
    console.log('\n🔍 Analyzing video with FFprobe...');
    
    return new Promise((resolve) => {
        const args = [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            videoPath
        ];
        
        const ffprobe = spawn(ffprobePath, args);
        let stdout = '';
        let stderr = '';
        
        ffprobe.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        ffprobe.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        ffprobe.on('close', (code) => {
            if (code === 0 && stdout) {
                try {
                    const data = JSON.parse(stdout);
                    console.log('📊 Video analysis completed');
                    
                    // フォーマット情報
                    if (data.format) {
                        console.log(`   Duration: ${data.format.duration}s`);
                        console.log(`   Bitrate: ${data.format.bit_rate} bps`);
                        console.log(`   Format: ${data.format.format_name}`);
                    }
                    
                    // ストリーム情報
                    console.log('📋 Streams:');
                    data.streams.forEach((stream, index) => {
                        console.log(`   Stream ${index}: ${stream.codec_type} (${stream.codec_name || 'unknown'})`);
                        if (stream.tags && stream.tags.handler_name) {
                            console.log(`     Handler: ${stream.tags.handler_name}`);
                        }
                        if (stream.codec_type === 'data') {
                            console.log(`     ⭐ Potential telemetry stream!`);
                        }
                    });
                    
                    resolve(data);
                } catch (parseError) {
                    console.log('❌ Failed to parse FFprobe output');
                    resolve(null);
                }
            } else {
                console.log(`❌ FFprobe failed (code: ${code})`);
                if (stderr) console.log(`Error: ${stderr}`);
                resolve(null);
            }
        });
        
        ffprobe.on('error', (error) => {
            console.log(`❌ FFprobe spawn error: ${error.message}`);
            resolve(null);
        });
    });
}

// テレメトリデータを抽出
async function extractTelemetry(videoPath, ffmpegPath, outputBaseName) {
    console.log('\n⚙️  Extracting telemetry data...');
    
    const binFile = path.join(outputDir, `${outputBaseName}.bin`);
    
    // 既存のbinファイルを削除
    if (fs.existsSync(binFile)) {
        fs.unlinkSync(binFile);
    }
    
    return new Promise((resolve) => {
        const args = [
            '-y',  // 上書きを許可
            '-i', videoPath,
            '-codec', 'copy',
            '-map', '0:3',  // ストリーム3を抽出（GoProの一般的なテレメトリストリーム）
            '-f', 'rawvideo',
            binFile
        ];
        
        console.log(`🔄 Running: ffmpeg ${args.slice(2).join(' ')}`);
        
        const ffmpeg = spawn(ffmpegPath, args);
        let stderr = '';
        
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                console.log('✅ FFmpeg extraction completed');
                
                // 生成されたファイルをチェック
                if (fs.existsSync(binFile)) {
                    const stats = fs.statSync(binFile);
                    console.log(`📊 Generated .bin file: ${(stats.size / 1024).toFixed(2)} KB`);
                    
                    if (stats.size > 0) {
                        console.log('🎉 Telemetry data extracted successfully!');
                        
                        // バイナリファイルの最初の部分を表示
                        const buffer = fs.readFileSync(binFile, { start: 0, end: 32 });
                        console.log(`📄 Binary preview: ${buffer.toString('hex')}`);
                        
                        // GPMFシグネチャをチェック
                        if (buffer.includes(Buffer.from('GPMF'))) {
                            console.log('🎯 GPMF signature found in extracted data!');
                        }
                        
                        resolve(binFile);
                    } else {
                        console.log('⚠️  Generated file is empty - trying alternative streams...');
                        resolve(null);
                    }
                } else {
                    console.log('❌ No .bin file generated');
                    resolve(null);
                }
            } else {
                console.log(`❌ FFmpeg failed with code: ${code}`);
                console.log('FFmpeg stderr output:');
                console.log(stderr);
                resolve(null);
            }
        });
        
        ffmpeg.on('error', (error) => {
            console.log(`❌ FFmpeg spawn error: ${error.message}`);
            resolve(null);
        });
    });
}

// 代替ストリームでの抽出を試行
async function tryAlternativeStreams(videoPath, ffmpegPath, outputBaseName) {
    console.log('\n🔄 Trying alternative streams...');
    
    const streams = ['0:2', '0:4', '0:5'];  // 代替ストリーム番号
    
    for (const streamMap of streams) {
        console.log(`🔄 Trying stream ${streamMap}...`);
        
        const binFile = path.join(outputDir, `${outputBaseName}_stream_${streamMap.replace(':', '_')}.bin`);
        
        const success = await new Promise((resolve) => {
            const args = ['-y', '-i', videoPath, '-codec', 'copy', '-map', streamMap, '-f', 'rawvideo', binFile];
            const ffmpeg = spawn(ffmpegPath, args, { stdio: 'pipe' });
            
            ffmpeg.on('close', (code) => {
                if (code === 0 && fs.existsSync(binFile) && fs.statSync(binFile).size > 0) {
                    const size = fs.statSync(binFile).size;
                    console.log(`✅ Stream ${streamMap}: ${(size / 1024).toFixed(2)} KB`);
                    
                    // GPMFシグネチャをチェック
                    const buffer = fs.readFileSync(binFile, { start: 0, end: Math.min(1024, size) });
                    if (buffer.includes(Buffer.from('GPMF'))) {
                        console.log(`🎯 GPMF found in stream ${streamMap}!`);
                        resolve(binFile);
                    } else {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
            
            ffmpeg.on('error', () => resolve(null));
        });
        
        if (success) {
            return success;
        }
    }
    
    return null;
}

// メインテスト関数
async function simpleTest(videoPath) {
    console.log(`\n🎬 Testing: ${videoPath}`);
    
    // ファイル基本情報
    const stats = fs.statSync(videoPath);
    console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📅 Modified: ${stats.mtime.toISOString()}`);
    
    // FFmpegとFFprobeのパスを取得
    const ffmpegPath = findFFmpeg();
    const ffprobePath = findFFprobe();
    
    if (!ffmpegPath) {
        console.log('\n💡 FFmpeg installation needed:');
        console.log('   cd ../../include');
        console.log('   wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz');
        console.log('   tar -xf ffmpeg-release-amd64-static.tar.xz');
        console.log('   mv ffmpeg-*-static ffmpeg');
        return false;
    }
    
    // 動画分析
    let videoInfo = null;
    if (ffprobePath) {
        videoInfo = await analyzeVideo(videoPath, ffprobePath);
    }
    
    // テレメトリ抽出
    const outputBaseName = path.parse(videoPath).name;
    let result = await extractTelemetry(videoPath, ffmpegPath, outputBaseName);
    
    // 主要ストリームで失敗した場合、代替を試行
    if (!result) {
        result = await tryAlternativeStreams(videoPath, ffmpegPath, outputBaseName);
    }
    
    return result !== null;
}

// メイン
async function main() {
    const videoName = process.argv[2] || 'GS010678.360';
    const videoPath = path.join(moviesDir, videoName);
    
    if (!fs.existsSync(videoPath)) {
        console.error(`❌ Video not found: ${videoPath}`);
        process.exit(1);
    }
    
    console.log(`\n🖥️  System info:`);
    console.log(`   Node.js: ${process.version}`);
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Arch: ${process.arch}`);
    
    const success = await simpleTest(videoPath);
    
    console.log(`\n📋 Final result: ${success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    
    if (success) {
        console.log('\n🎉 Telemetry extraction successful!');
        console.log('📁 Check output directory:');
        console.log(`   ls -la ${outputDir}`);
        console.log('\n💡 Next steps:');
        console.log('   1. Use gopro2gpx to convert .bin to .gpx');
        console.log('   2. Or integrate with the Python pipeline');
    } else {
        console.log('\n💡 Troubleshooting:');
        console.log('   • This video may not contain telemetry data');
        console.log('   • Try with a different GoPro video');
        console.log('   • Ensure the video was recorded with GPS enabled');
        console.log('   • Check if this is from a Hero5 or newer model');
    }
    
    process.exit(success ? 0 : 1);
}

main().catch(error => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
});