// A recording stays in its original container. Read only MP4/MOV box headers
// and track metadata; never load or transcode the whole movie on the UI thread.
function sourceError(message, code = 'RMT_MV_VIDEO_AUDIO') {
    return Object.assign(new Error(message), { code });
}

export function isVideoAudioSource(blob, name = '') {
    return /^video\//i.test(blob?.type || '') || /\.(?:mp4|mov|m4v)$/i.test(name || blob?.name || '');
}

export async function inspectVideoAudioSource(blob, { signal } = {}) {
    const invalid = () => sourceError('这个视频文件不完整或无法读取，原有歌曲未替换。');
    const read = async (start, size) => {
        signal?.throwIfAborted?.();
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0 || start + size > blob.size) throw invalid();
        const buffer = await blob.slice(start, start + size).arrayBuffer();
        signal?.throwIfAborted?.();
        if (buffer.byteLength !== size) throw invalid();
        return new DataView(buffer);
    };
    const word = (data, at) => String.fromCharCode(...[0, 1, 2, 3].map(i => data.getUint8(at + i)));
    let headers = 0;
    async function boxes(start, end) {
        const result = [];
        while (start < end) {
            if (end - start < 8) throw invalid();
            const header = await read(start, 8);
            const type = word(header, 4);
            let size = header.getUint32(0), length = 8;
            if (size === 1) {
                const large = await read(start + 8, 8);
                size = large.getUint32(0) * 4294967296 + large.getUint32(4); length = 16;
            } else if (size === 0) size = end - start;
            if (!Number.isSafeInteger(size) || size < length || start + size > end) throw invalid();
            result.push({ type, start: start + length, end: start + size });
            start += size;
            // Yield even for an unusual container with many tiny boxes.
            if (++headers % 128 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        return result;
    }
    if (!blob || typeof blob.slice !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 8) throw invalid();
    const roots = await boxes(0, blob.size), movie = roots.find(box => box.type === 'moov');
    if (!movie) throw sourceError('暂时无法读取这个视频的音轨，请选择 MP4 或 MOV 录屏。');
    const children = await boxes(movie.start, movie.end);
    async function hasFragmentSamples(trackBoxes) {
        const header = trackBoxes.find(box => box.type === 'tkhd');
        if (!header || header.end - header.start < 16) return false;
        const version = (await read(header.start, 1)).getUint8(0), offset = version === 1 ? 20 : 12;
        if (header.end - header.start < offset + 4) return false;
        const trackId = (await read(header.start + offset, 4)).getUint32(0);
        for (const fragment of roots.filter(box => box.type === 'moof')) {
            for (const part of (await boxes(fragment.start, fragment.end)).filter(box => box.type === 'traf')) {
                const partBoxes = await boxes(part.start, part.end), info = partBoxes.find(box => box.type === 'tfhd');
                if (!info || info.end - info.start < 8 || (await read(info.start + 4, 4)).getUint32(0) !== trackId) continue;
                for (const run of partBoxes.filter(box => box.type === 'trun')) {
                    if (run.end - run.start >= 8 && (await read(run.start + 4, 4)).getUint32(0) > 0) return true;
                }
            }
        }
        return false;
    }
    for (const track of children.filter(box => box.type === 'trak')) {
        const trackBoxes = await boxes(track.start, track.end), media = trackBoxes.find(box => box.type === 'mdia');
        if (!media) continue;
        const mediaBoxes = await boxes(media.start, media.end), handler = mediaBoxes.find(box => box.type === 'hdlr');
        if (!handler || handler.end - handler.start < 12 || word(await read(handler.start + 8, 4), 0) !== 'soun') continue;
        const info = mediaBoxes.find(box => box.type === 'minf');
        if (!info) continue;
        const table = (await boxes(info.start, info.end)).find(box => box.type === 'stbl');
        if (!table) continue;
        const samples = (await boxes(table.start, table.end)).find(box => box.type === 'stsz' || box.type === 'stz2');
        if (samples && samples.end - samples.start >= 12) {
            const count = (await read(samples.start + 8, 4)).getUint32(0);
            if (count > 0 || await hasFragmentSamples(trackBoxes)) return { kind: 'video', hasAudio: true };
        }
    }
    throw sourceError('这个视频没有可用音轨，原有歌曲未替换。', 'RMT_MV_VIDEO_SILENT');
}
