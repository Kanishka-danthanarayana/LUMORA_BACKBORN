import React, { useState, useRef } from 'react';
import { Upload, Download, RotateCcw, Image as ImageIcon, BoxSelect, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import ImageTracer from 'imagetracerjs';

// Strip background/transparent paths that ImageTracer generates (they show as outlines in Inkscape)
const cleanSvgPaths = (svgString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const paths = doc.querySelectorAll('path');
    paths.forEach(path => {
        const opacity = path.getAttribute('opacity');
        const fill = path.getAttribute('fill');
        // Remove transparent paths and white-filled paths (background regions)
        if (opacity === '0' || fill === 'rgb(255,255,255)') {
            path.remove();
        }
    });
    return new XMLSerializer().serializeToString(doc);
};

const NestingModule = () => {
    const [image, setImage] = useState(null);
    const [nestImage, setNestImage] = useState(null);
    const [nestingUrl, setNestingUrl] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [nestOffset, setNestOffset] = useState(0.5);
    const [nestOffsetY, setNestOffsetY] = useState(0.5);
    const [nestScale, setNestScale] = useState(0.9);
    const [dims, setDims] = useState({ base: null, nest: null, nOut: null });
    const [error, setError] = useState(null);

    const baseInputRef = useRef(null);
    const nestInputRef = useRef(null);

    const handleDrop = (e, target) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadImage(file, target);
    };

    const loadImage = (file, target) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth, h = img.naturalHeight;
                if (target === 'nest') {
                    setNestImage(e.target.result);
                    setDims(prev => ({ ...prev, nest: `${w} x ${h}` }));
                } else {
                    setImage(e.target.result);
                    setDims(prev => ({ ...prev, base: `${w} x ${h}` }));
                }
                setNestingUrl(null);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const processSingleDesign = async (imgSrc) => {
        const img = new Image(); img.src = imgSrc; await img.decode();
        let W = img.naturalWidth, H = img.naturalHeight;
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, W, H).data;
        const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].map(p => [Math.floor(p[0]), Math.floor(p[1])]);
        let sR = 0, sG = 0, sB = 0, sA = 0; corners.forEach(([cx, cy]) => { const i = (cy * W + cx) * 4; sR += data[i]; sG += data[i + 1]; sB += data[i + 2]; sA += data[i + 3]; });
        const bg = { r: Math.round(sR / 4), g: Math.round(sG / 4), b: Math.round(sB / 4), a: Math.round(sA / 4) };
        
        const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
        const mCtx = mask.getContext('2d'); const mData = mCtx.createImageData(W, H);
        
        const filledMask = document.createElement('canvas'); filledMask.width = W; filledMask.height = H;
        const fmCtx = filledMask.getContext('2d'); const fmData = fmCtx.createImageData(W, H);
        
        const visited = new Uint8Array(W * H);
        const stack = new Int32Array(W * H);
        let stackPtr = 0;
        
        const isBg = (x, y) => {
            const i = (y * W + x) * 4;
            const diff = Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b) + Math.abs(data[i + 3] - bg.a);
            return diff <= 20;
        };

        // Seed flood fill from all image boundaries to ensure disconnected background regions are filled
        for (let x = 0; x < W; x++) {
            if (isBg(x, 0)) { const idx = x; if (!visited[idx]) { visited[idx] = 1; stack[stackPtr++] = idx; } }
            if (isBg(x, H - 1)) { const idx = (H - 1) * W + x; if (!visited[idx]) { visited[idx] = 1; stack[stackPtr++] = idx; } }
        }
        for (let y = 0; y < H; y++) {
            if (isBg(0, y)) { const idx = y * W; if (!visited[idx]) { visited[idx] = 1; stack[stackPtr++] = idx; } }
            if (isBg(W - 1, y)) { const idx = y * W + (W - 1); if (!visited[idx]) { visited[idx] = 1; stack[stackPtr++] = idx; } }
        }

        while (stackPtr > 0) {
            const idx = stack[--stackPtr];
            const x = idx % W, y = Math.floor(idx / W);
            
            if (x > 0 && !visited[idx - 1] && isBg(x - 1, y)) { visited[idx - 1] = 1; stack[stackPtr++] = idx - 1; }
            if (x < W - 1 && !visited[idx + 1] && isBg(x + 1, y)) { visited[idx + 1] = 1; stack[stackPtr++] = idx + 1; }
            if (y > 0 && !visited[idx - W] && isBg(x, y - 1)) { visited[idx - W] = 1; stack[stackPtr++] = idx - W; }
            if (y < H - 1 && !visited[idx + W] && isBg(x, y + 1)) { visited[idx + W] = 1; stack[stackPtr++] = idx + W; }
        }

        let hasDesign = false;
        for (let i = 0; i < data.length; i += 4) {
            const diff = Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b) + Math.abs(data[i + 3] - bg.a);
            
            if (diff > 20) {
                mData.data[i] = 255; mData.data[i + 1] = 255; mData.data[i + 2] = 255; mData.data[i + 3] = 255;
                hasDesign = true;
            }
            
            if (!visited[i / 4]) {
                fmData.data[i] = 255; fmData.data[i + 1] = 255; fmData.data[i + 2] = 255; fmData.data[i + 3] = 255;
            }
        }
        
        mCtx.putImageData(mData, 0, 0);
        fmCtx.putImageData(fmData, 0, 0);
        return hasDesign ? { mask, filledMask, W, H } : null;
    };

    const _processNestingInternal = async (offsetX, offsetY, scale) => {
        setIsProcessing(true); setError(null);
        try {
            const frameData = await processSingleDesign(image);
            if (!frameData) throw new Error("No frame detected.");
            const nestImgObj = new Image(); nestImgObj.src = nestImage; await nestImgObj.decode();
            const nW = nestImgObj.naturalWidth, nH = nestImgObj.naturalHeight;
            const W = frameData.W, H = frameData.H;

            const draw = (preview) => {
                const exportScale = preview ? 1 : 4;
                const outW = W * exportScale;
                const outH = H * exportScale;

                const out = document.createElement('canvas'); out.width = outW; out.height = outH;
                const oCtx = out.getContext('2d'); 
                
                // Re-enable smoothing to ensure continuous lines and prevent blocky/jagged edges
                oCtx.imageSmoothingEnabled = true;
                oCtx.imageSmoothingQuality = 'high';
                
                oCtx.fillStyle = '#000'; oCtx.fillRect(0, 0, outW, outH);
                
                if (preview) {
                    oCtx.drawImage(frameData.mask, 0, 0, outW, outH);
                } else {
                    oCtx.drawImage(frameData.filledMask, 0, 0, outW, outH);
                }
                
                const nX = (W * offsetX - (nW * scale) / 2) * exportScale;
                const nY = (H * offsetY - (nH * scale) / 2) * exportScale;
                const nWidth = (nW * scale) * exportScale;
                const nHeight = (nH * scale) * exportScale;

                oCtx.drawImage(nestImgObj, nX, nY, nWidth, nHeight);
                
                if (preview) { 
                    oCtx.strokeStyle = '#00ff00'; oCtx.lineWidth = 2; 
                    oCtx.strokeRect(nX, nY, nWidth, nHeight); 
                }
                
                return out.toDataURL('image/png', 1.0);
            };
            setNestingUrl(draw(true));
            window._nestDownload = () => draw(false);
            window._nestDownloadSVG = () => {
                const exportScale = 4;
                const outW = W * exportScale;
                const outH = H * exportScale;

                const out = document.createElement('canvas'); out.width = outW; out.height = outH;
                const oCtx = out.getContext('2d', { willReadFrequently: true }); 
                
                oCtx.imageSmoothingEnabled = true;
                oCtx.imageSmoothingQuality = 'high';
                
                oCtx.fillStyle = '#000'; oCtx.fillRect(0, 0, outW, outH);
                oCtx.drawImage(frameData.filledMask, 0, 0, outW, outH);
                
                const nX = (W * offsetX - (nW * scale) / 2) * exportScale;
                const nY = (H * offsetY - (nH * scale) / 2) * exportScale;
                const nWidth = (nW * scale) * exportScale;
                const nHeight = (nH * scale) * exportScale;

                oCtx.drawImage(nestImgObj, nX, nY, nWidth, nHeight);

                const imgData = oCtx.getImageData(0, 0, outW, outH);
                
                // Threshold to make background transparent and lines black
                for (let i = 0; i < imgData.data.length; i += 4) {
                    const avg = (imgData.data[i] + imgData.data[i+1] + imgData.data[i+2]) / 3;
                    const isWhite = avg > 127;
                    // White design becomes opaque black paths; Black background becomes transparent white
                    imgData.data[i] = isWhite ? 0 : 255;
                    imgData.data[i+1] = isWhite ? 0 : 255;
                    imgData.data[i+2] = isWhite ? 0 : 255;
                    imgData.data[i+3] = isWhite ? 255 : 0; 
                }

                const rawSvg = ImageTracer.imagedataToSVG(imgData, { 
                    ltres: 1, 
                    qtres: 1, 
                    pathomit: 8, 
                    colorsampling: 0, 
                    numberofcolors: 2, 
                    strokewidth: 0, 
                    linefilter: false 
                });
                const svgString = cleanSvgPaths(rawSvg);
                
                return 'data:image/svg+xml;base64,' + btoa(svgString);
            };
            setDims(prev => ({ ...prev, nOut: `${W} x ${H}` }));
        } catch (e) { setError(e.message); } finally { setIsProcessing(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="preview-area" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <div className="preview-box" onClick={() => baseInputRef.current.click()} style={{ cursor: 'pointer', minHeight: '200px' }} onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, 'base')}>
                    <div className="label" style={{ fontSize: '10px', color: '#555', marginBottom: '10px' }}>01. BASE {dims.base && `(${dims.base})`}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '150px' }}>
                        {!image ? <Upload style={{ opacity: 0.1 }} size={40} /> : <img src={image} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
                    </div>
                </div>
                <div className="preview-box" onClick={() => nestInputRef.current.click()} style={{ cursor: 'pointer', minHeight: '200px' }} onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, 'nest')}>
                    <div className="label" style={{ fontSize: '10px', color: '#555', marginBottom: '10px' }}>02. PART {dims.nest && `(${dims.nest})`}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '150px' }}>
                        {!nestImage ? <Upload style={{ opacity: 0.1 }} size={40} /> : <img src={nestImage} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
                    </div>
                </div>
                <div className="preview-box" style={{ flex: 2, minHeight: '300px' }}>
                    <div className="label" style={{ fontSize: '10px', color: '#555', marginBottom: '10px' }}>03. PREVIEW {dims.nOut && `(${dims.nOut})`}</div>
                    <div style={{ backgroundColor: '#000', borderRadius: '16px', border: '1px solid #222', minHeight: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {nestingUrl ? <img src={nestingUrl} style={{ maxWidth: '95%', maxHeight: '400px', objectFit: 'contain' }} /> : <ImageIcon opacity={0.05} size={64} />}
                    </div>
                </div>
            </div>

            {error && <div style={{ color: '#ef4444', fontSize: '12px', textAlign: 'center' }}>{error}</div>}

            <input ref={baseInputRef} type="file" hidden onChange={e => loadImage(e.target.files[0], 'base')} />
            <input ref={nestInputRef} type="file" hidden onChange={e => loadImage(e.target.files[0], 'nest')} />

            {image && nestImage && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', padding: '30px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '10px' }}><span>Alignment X</span><span>{Math.round(nestOffset * 100)}%</span></div>
                        <input type="range" min="0" max="1" step="0.01" value={nestOffset} onChange={e => { setNestOffset(parseFloat(e.target.value)); if (nestingUrl) _processNestingInternal(parseFloat(e.target.value), nestOffsetY, nestScale); }} style={{ width: '100%', accentColor: '#6366f1' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '10px' }}><span>Alignment Y</span><span>{Math.round(nestOffsetY * 100)}%</span></div>
                        <input type="range" min="0" max="1" step="0.01" value={nestOffsetY} onChange={e => { setNestOffsetY(parseFloat(e.target.value)); if (nestingUrl) _processNestingInternal(nestOffset, parseFloat(e.target.value), nestScale); }} style={{ width: '100%', accentColor: '#6366f1' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '10px' }}><span>Scale</span><span>{Math.round(nestScale * 100)}%</span></div>
                        <input type="range" min="0.1" max="2" step="0.01" value={nestScale} onChange={e => { setNestScale(parseFloat(e.target.value)); if (nestingUrl) _processNestingInternal(nestOffset, nestOffsetY, parseFloat(e.target.value)); }} style={{ width: '100%', accentColor: '#6366f1' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => _processNestingInternal(nestOffset, nestOffsetY, nestScale)} disabled={isProcessing} className="btn-primary" style={{ padding: '15px 30px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {isProcessing ? <RotateCcw className="spin" size={18} /> : <Play size={18} />} {nestingUrl ? "Update" : "Nesting Run"}
                        </button>
                        {nestingUrl && <button onClick={() => { const a = document.createElement('a'); a.href = window._nestDownload(); a.download = 'nest_result.png'; a.click(); }} className="btn-secondary" style={{ padding: '15px 30px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#10b981', color: '#000' }}><Download size={18} /> PNG</button>}
                        {nestingUrl && <button onClick={() => { const a = document.createElement('a'); a.href = window._nestDownloadSVG(); a.download = 'nest_result.svg'; a.click(); }} className="btn-secondary" style={{ padding: '15px 30px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#3b82f6', color: '#fff' }}><Download size={18} /> SVG</button>}
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default NestingModule;
