// Source-pixel crops for paired avatars. Display order never changes the source.
const CORS_MESSAGE = '这张图片的地址不允许浏览器裁切。请保存原图，或导入本地原图后再裁切。';
const CANVAS_MESSAGE = '当前浏览器无法导出裁切图片。原图仍可查看和保存。';

export function defaultPairCrops() {
    return [{ zoom: 1, x: 0, y: 0 }, { zoom: 1, x: 0, y: 0 }];
}

export function normalizeCrop(value) {
    const number = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    return {
        zoom: Math.max(1, number(value?.zoom, 1)),
        x: Math.max(-100, Math.min(100, number(value?.x, 0))),
        y: Math.max(-100, Math.min(100, number(value?.y, 0))),
    };
}

function dimensions(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
        throw new Error('图片尺寸无法读取，请重新打开原图。');
    return { width: Math.floor(width), height: Math.floor(height) };
}

export function cropRect(width, height, halfIndex, crop) {
    const d = dimensions(width, height), c = normalizeCrop(crop);
    const split = Math.floor(d.width / 2), right = Number(halfIndex) === 1;
    // A one-pixel-wide original has one available column for either avatar.
    const start = right ? split : 0;
    const halfWidth = Math.max(1, right ? d.width - split : split);
    const size = Math.max(1, Math.min(halfWidth, d.height) / c.zoom);
    return {
        x: start + (halfWidth - size) * (c.x + 100) / 200,
        y: (d.height - size) * (c.y + 100) / 200,
        size,
        outputSize: Math.max(1, Math.floor(size)),
    };
}

function isExternalImage(url) {
    try {
        const parsed = new URL(url, document.baseURI);
        return /^https?:$/.test(parsed.protocol) && parsed.origin !== window.location.origin;
    } catch (_) { return false; }
}

function decodeImage(url, anonymous = false) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        if (anonymous) image.crossOrigin = 'anonymous';
        const clear = () => { image.onload = null; image.onerror = null; };
        image.onload = () => {
            clear();
            if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image);
            else reject(new Error('图片尺寸无法读取，请重新打开原图。'));
        };
        image.onerror = () => { clear(); reject(new Error('图片暂时无法打开，请检查图片地址，或导入已保存的原图。')); };
        image.src = url;
    });
}

function cropFailure(error) {
    const blocked = error?.name === 'SecurityError' || error?.code === 18;
    const result = new Error(blocked ? CORS_MESSAGE : CANVAS_MESSAGE);
    result.code = blocked ? 'PAIR_IMAGE_CORS' : 'PAIR_IMAGE_CANVAS';
    return result;
}

function inspectCanvasAccess(image) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(image, 0, 0, 1, 1);
        context.getImageData(0, 0, 1, 1);
        return { croppable: true };
    } catch (error) {
        return { croppable: false, error: cropFailure(error).message };
    }
}

export async function loadPairImage(url) {
    if (typeof url !== 'string' || !url.trim()) throw new Error('尚未找到可打开的原图。');
    let image;
    if (isExternalImage(url)) {
        try { image = await decodeImage(url, true); }
        catch (_) { image = await decodeImage(url); }
    } else image = await decodeImage(url);
    return {
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        ...inspectCanvasAccess(image),
    };
}

export function cropPairImage(loaded, crops, order = [0, 1]) {
    if (!loaded?.image) throw new Error('原图尚未打开，请稍后重试。');
    if (loaded.croppable === false) throw new Error(loaded.error || CORS_MESSAGE);
    const d = dimensions(loaded.width, loaded.height);
    const halves = order?.[0] === 1 ? [1, 0] : [0, 1];
    try {
        return halves.map(halfIndex => {
            const rect = cropRect(d.width, d.height, halfIndex, crops?.[halfIndex]);
            const canvas = document.createElement('canvas');
            canvas.width = rect.outputSize; canvas.height = rect.outputSize;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas unavailable');
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(loaded.image, rect.x, rect.y, rect.size, rect.size, 0, 0, canvas.width, canvas.height);
            const url = canvas.toDataURL('image/png');
            if (!url.startsWith('data:image/png')) throw new Error('Canvas export unavailable');
            return { url, width: rect.outputSize, height: rect.outputSize, halfIndex };
        });
    } catch (error) { throw cropFailure(error); }
}

// Apply to a native <img> inside a relative, square, overflow-hidden wrapper.
// Percentages reference that square, reproducing the source crop even when CORS
// prevents pixel access. Border radius belongs on the wrapper, never in the PNG.
export function cropPreviewStyle(width, height, halfIndex, crop) {
    const d = dimensions(width, height), rect = cropRect(d.width, d.height, halfIndex, crop);
    return {
        position: 'absolute', display: 'block',
        width: `${d.width / rect.size * 100}%`, height: `${d.height / rect.size * 100}%`,
        left: `${-rect.x / rect.size * 100}%`, top: `${-rect.y / rect.size * 100}%`,
        right: 'auto', bottom: 'auto', margin: '0',
        maxWidth: 'none', maxHeight: 'none', objectFit: 'fill', objectPosition: '0 0',
        transform: 'none', borderRadius: '0',
    };
}

export async function fileToPairOriginal(file) {
    if (!file) throw new Error('请选择要导入的图片。');
    const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
            ? resolve(reader.result) : reject(new Error('未能读取图片，请重新选择文件。'));
        reader.onerror = () => reject(new Error('未能读取图片，请重新选择文件。'));
        reader.onabort = () => reject(new Error('图片读取已取消。'));
        reader.readAsDataURL(file);
    });
    // Keep FileReader's original bytes. Decoding only checks that it is an image.
    const image = await decodeImage(url);
    return { url, width: image.naturalWidth, height: image.naturalHeight, name: String(file.name || '导入图片') };
}

export async function pngFile(dataUrl, filename = '情侣头像.png') {
    const match = typeof dataUrl === 'string' && /^data:image\/png;base64,([\s\S]+)$/i.exec(dataUrl);
    if (!match) throw new Error('没有可分享的 PNG 图片，请重新打开保存窗口。');
    const binary = atob(match[1]), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const options = { type: 'image/png' };
    if (typeof File === 'function') {
        try { return new File([bytes], filename, options); }
        catch (_) { /* Some embedded browsers expose File without construction. */ }
    }
    return new Blob([bytes], options);
}
