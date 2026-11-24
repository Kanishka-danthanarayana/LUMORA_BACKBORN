import React, { useState, useRef } from 'react';
import { Upload, Download, RotateCcw, Play, Image as ImageIcon } from 'lucide-react';
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

const dilateMask = (mask, W, H, radius) => {
    const dilated = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        const rowOffset = y * W;
        for (let x = 0; x < W; x++) {
            if (mask[rowOffset + x] === 1) {
                const yMin = Math.max(0, y - radius);
                const yMax = Math.min(H - 1, y + radius);
                const xMin = Math.max(0, x - radius);
                const xMax = Math.min(W - 1, x + radius);
                for (let ny = yMin; ny <= yMax; ny++) {
                    const rOffset = ny * W;
                    for (let nx = xMin; nx <= xMax; nx++) {
                        dilated[rOffset + nx] = 1;
                    }
                }
            }
        }
    }
    return dilated;
};

const VectorizerModule = () => {
    const [image, setImage] = useState(null);
    const [dims, setDims] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [svgData, setSvgData] = useState(null);
    const [threshold, setThreshold] = useState(127);
    const [cncMode, setCncMode] = useState(false);
    const [trimWidth, setTrimWidth] = useState(3);
    const [cutColor, setCutColor] = useState('#ef4444');
    const [excludeOuterFromEng, setExcludeOuterFromEng] = useState(true);
    const [cutSvgData, setCutSvgData] = useState(null);
    const [engSvgData, setEngSvgData] = useState(null);
    const [previewTab, setPreviewTab] = useState('combined');
    const [fileName, setFileName] = useState('vectorized_image');
    const [keytagHole, setKeytagHole] = useState(false);
    const [holeRadius, setHoleRadius] = useState(5);
    const [holeOffset, setHoleOffset] = useState(15);
    const [holeOffsetX, setHoleOffsetX] = useState(0);
    const [usePhysicalSize, setUsePhysicalSize] = useState(false);
    const [physicalHeight, setPhysicalHeight] = useState(10);
    const inputRef = useRef(null);

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadImage(file);
    };

    const loadImage = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                setImage(e.target.result);
                setDims(`${img.naturalWidth} x ${img.naturalHeight}`);
                setSvgData(null);
                setCutSvgData(null);
                setEngSvgData(null);
                setError(null);
            };
            img.src = e.target.result;
        };
        const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        setFileName(baseName);
        reader.readAsDataURL(file);
    };

    const handleSettingChange = (setter, value) => {
        setter(value);
        setSvgData(null);
        setCutSvgData(null);
        setEngSvgData(null);
    };

    const getCalculatedWidth = () => {
        if (!dims || !physicalHeight) return '--';
        const parts = dims.split(' ');
        if (parts.length >= 3) {
            const w = parseInt(parts[0]);
            const h = parseInt(parts[2]);
            if (w > 0 && h > 0) {
                return `${(physicalHeight * (w / h)).toFixed(2)} cm`;
            }
        }
        return '--';
    };

    const adjustSvgPhysicalDimensions = (svgString, W, H) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (svg) {
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            if (usePhysicalSize && physicalHeight > 0) {
                const pWidth = physicalHeight * (W / H);
                svg.setAttribute('width', `${pWidth.toFixed(2)}cm`);
                svg.setAttribute('height', `${physicalHeight.toFixed(2)}cm`);
            } else {
                svg.setAttribute('width', W.toString());
                svg.setAttribute('height', H.toString());
            }
        }
        return new XMLSerializer().serializeToString(doc);
    };

    const processVectorization = () => {
        if (!image) return;
        setIsProcessing(true);
        setError(null);
        
        setTimeout(() => {
            try {
                const imgObj = new Image();
                imgObj.onload = () => {
                    const W = imgObj.naturalWidth;
                    const H = imgObj.naturalHeight;
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = W;
                    canvas.height = H;
                    const ctx = canvas.getContext('2d');
                    
                    ctx.drawImage(imgObj, 0, 0);
                    const imgData = ctx.getImageData(0, 0, W, H);
                    
                    // Apply threshold for pure B&W vectorization, making white transparent
                    for (let i = 0; i < imgData.data.length; i += 4) {
                        const isOriginalTransparent = imgData.data[i+3] < 127;
                        const avg = (imgData.data[i] + imgData.data[i+1] + imgData.data[i+2]) / 3;
                        const isWhite = avg > threshold || isOriginalTransparent;
                        imgData.data[i] = isWhite ? 255 : 0;
                        imgData.data[i+1] = isWhite ? 255 : 0;
                        imgData.data[i+2] = isWhite ? 255 : 0;
                        imgData.data[i+3] = isWhite ? 0 : 255; // Transparent background prevents bounding box traces
                    }
                    
                    if (!cncMode) {
                        const rawSvg = ImageTracer.imagedataToSVG(imgData, { 
                            ltres: 1, 
                            qtres: 1, 
                            pathomit: 8, 
                            colorsampling: 0, 
                            numberofcolors: 2, 
                            strokewidth: 0, 
                            linefilter: false 
                        });
                        const svgstr = cleanSvgPaths(rawSvg);
                        const finalSvgStr = adjustSvgPhysicalDimensions(svgstr, W, H);
                        
                        // Use encodeURIComponent to safely handle unicode/special chars in SVG
                        setSvgData('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(finalSvgStr));
                        setCutSvgData(null);
                        setEngSvgData(null);
                    } else {
                        // CNC Split Mode logic
                        const W_val = imgData.width;
                        const H_val = imgData.height;
                        const data = imgData.data;

                        // 1. Build foreground mask (opaque pixels)
                        const fg = new Uint8Array(W_val * H_val);
                        for (let i = 0; i < W_val * H_val; i++) {
                            fg[i] = (data[i * 4 + 3] !== 0) ? 1 : 0;
                        }

                        // 2. Dilate foreground to close small gaps in the outlines (radius 3)
                        const dilatedFg = dilateMask(fg, W_val, H_val, 3);

                        const visited = new Uint8Array(W_val * H_val);
                        const queue = [];
                        
                        // 3. Flood fill background from borders on dilatedFg
                        for (let x = 0; x < W_val; x++) {
                            const topIdx = x;
                            if (dilatedFg[topIdx] === 0 && visited[topIdx] === 0) {
                                visited[topIdx] = 1;
                                queue.push(topIdx);
                            }
                            const botIdx = (H_val - 1) * W_val + x;
                            if (dilatedFg[botIdx] === 0 && visited[botIdx] === 0) {
                                visited[botIdx] = 1;
                                queue.push(botIdx);
                            }
                        }
                        for (let y = 0; y < H_val; y++) {
                            const leftIdx = y * W_val;
                            if (dilatedFg[leftIdx] === 0 && visited[leftIdx] === 0) {
                                visited[leftIdx] = 1;
                                queue.push(leftIdx);
                            }
                            const rightIdx = y * W_val + (W_val - 1);
                            if (dilatedFg[rightIdx] === 0 && visited[rightIdx] === 0) {
                                visited[rightIdx] = 1;
                                queue.push(rightIdx);
                            }
                        }
                        
                        let head = 0;
                        while (head < queue.length) {
                            const idx = queue[head++];
                            const x = idx % W_val;
                            const y = Math.floor(idx / W_val);
                            
                            const neighbors = [
                                [x + 1, y],
                                [x - 1, y],
                                [x, y + 1],
                                [x, y - 1]
                            ];
                            for (const [nx, ny] of neighbors) {
                                if (nx >= 0 && nx < W_val && ny >= 0 && ny < H_val) {
                                    const nidx = ny * W_val + nx;
                                    if (visited[nidx] === 0 && dilatedFg[nidx] === 0) {
                                        visited[nidx] = 1;
                                        queue.push(nidx);
                                    }
                                }
                            }
                        }

                        // 4. Dilate visited background to restore original outer outline boundary
                        const finalBg = dilateMask(visited, W_val, H_val, 3);
                        
                        // Find bounding box and topmost center point of silhouette
                        let xMin = W_val, xMax = 0, yMin = H_val, yMax = 0;
                        let hasSilhouette = false;
                        for (let y = 0; y < H_val; y++) {
                            for (let x = 0; x < W_val; x++) {
                                const idx = y * W_val + x;
                                if (finalBg[idx] === 0) {
                                    hasSilhouette = true;
                                    if (x < xMin) xMin = x;
                                    if (x > xMax) xMax = x;
                                    if (y < yMin) yMin = y;
                                    if (y > yMax) yMax = y;
                                }
                            }
                        }
                        
                        let cx = (xMin + xMax) / 2;
                        let cy = yMin + holeOffset;
                        if (hasSilhouette) {
                            let sumX = 0;
                            let countX = 0;
                            const rowTolerance = Math.min(5, yMax - yMin);
                            for (let y = yMin; y <= yMin + rowTolerance; y++) {
                                for (let x = 0; x < W_val; x++) {
                                    const idx = y * W_val + x;
                                    if (finalBg[idx] === 0) {
                                        sumX += x;
                                        countX++;
                                    }
                                }
                            }
                            cx = (countX > 0 ? sumX / countX : (xMin + xMax) / 2) + holeOffsetX;
                            cy = yMin + holeOffset;
                        }
 
                        // Create Silhouette Image Data (Cut path)
                        const cutCanvas = document.createElement('canvas');
                        cutCanvas.width = W_val;
                        cutCanvas.height = H_val;
                        const cutCtx = cutCanvas.getContext('2d');
                        const cutImgData = cutCtx.createImageData(W_val, H_val);
                        
                        for (let i = 0; i < W_val * H_val; i++) {
                            const pIdx = i * 4;
                            if (finalBg[i] === 0) {
                                cutImgData.data[pIdx] = 0;
                                cutImgData.data[pIdx + 1] = 0;
                                cutImgData.data[pIdx + 2] = 0;
                                cutImgData.data[pIdx + 3] = 255;
                            } else {
                                cutImgData.data[pIdx] = 255;
                                cutImgData.data[pIdx + 1] = 255;
                                cutImgData.data[pIdx + 2] = 255;
                                cutImgData.data[pIdx + 3] = 0;
                            }
                        }
                        
                        // Trace image data to SVG
                        const rawCutSvg = ImageTracer.imagedataToSVG(cutImgData, {
                            ltres: 1,
                            qtres: 1,
                            pathomit: 8,
                            colorsampling: 0,
                            numberofcolors: 2,
                            strokewidth: 0,
                            linefilter: false
                        });
                        
                        const cleanCutSvg = cleanSvgPaths(rawCutSvg);
                        const parser = new DOMParser();
                        const cutDoc = parser.parseFromString(cleanCutSvg, 'image/svg+xml');
                        const cutPaths = cutDoc.querySelectorAll('path');
                        cutPaths.forEach(path => {
                            path.setAttribute('fill', 'none');
                            path.setAttribute('stroke', cutColor);
                            path.setAttribute('stroke-width', '1.5');
                        });
 
                        if (keytagHole && hasSilhouette) {
                            const svgElement = cutDoc.querySelector('svg');
                            if (svgElement) {
                                const circle = cutDoc.createElementNS('http://www.w3.org/2000/svg', 'circle');
                                circle.setAttribute('cx', cx.toFixed(1));
                                circle.setAttribute('cy', cy.toFixed(1));
                                circle.setAttribute('r', holeRadius.toString());
                                circle.setAttribute('fill', 'none');
                                circle.setAttribute('stroke', cutColor);
                                circle.setAttribute('stroke-width', '1.5');
                                svgElement.appendChild(circle);
                            }
                        }
 
                        const cutSvgElement = cutDoc.querySelector('svg');
                        if (cutSvgElement) {
                            cutSvgElement.setAttribute('viewBox', `0 0 ${W_val} ${H_val}`);
                            if (usePhysicalSize && physicalHeight > 0) {
                                const pWidth = physicalHeight * (W_val / H_val);
                                cutSvgElement.setAttribute('width', `${pWidth.toFixed(2)}cm`);
                                cutSvgElement.setAttribute('height', `${physicalHeight.toFixed(2)}cm`);
                            } else {
                                cutSvgElement.setAttribute('width', W_val.toString());
                                cutSvgElement.setAttribute('height', H_val.toString());
                            }
                        }
 
                        const cutSvgFinalStr = new XMLSerializer().serializeToString(cutDoc);
                        setCutSvgData('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cutSvgFinalStr));
                        
                        // Create Engraving Image Data (Inner details path)
                        const engCanvas = document.createElement('canvas');
                        engCanvas.width = W_val;
                        engCanvas.height = H_val;
                        const engCtx = engCanvas.getContext('2d');
                        const engImgData = engCtx.createImageData(W_val, H_val);
                        
                        for (let i = 0; i < data.length; i++) {
                            engImgData.data[i] = data[i];
                        }
                        
                        if (excludeOuterFromEng) {
                            const R = trimWidth;
                            for (let y = 0; y < H_val; y++) {
                                for (let x = 0; x < W_val; x++) {
                                    const idx = y * W_val + x;
                                    if (data[idx * 4 + 3] === 255) {
                                        let isNearOutside = false;
                                        for (let dy = -R; dy <= R; dy++) {
                                            const ny = y + dy;
                                            if (ny < 0 || ny >= H_val) continue;
                                            for (let dx = -R; dx <= R; dx++) {
                                                const nx = x + dx;
                                                if (nx < 0 || nx >= W_val) continue;
                                                if (finalBg[ny * W_val + nx] === 1) {
                                                    isNearOutside = true;
                                                    break;
                                                }
                                            }
                                            if (isNearOutside) break;
                                        }
                                        if (isNearOutside) {
                                            engImgData.data[idx * 4 + 3] = 0;
                                        }
                                    }
                                }
                            }
                        }
                        
                        const rawEngSvg = ImageTracer.imagedataToSVG(engImgData, {
                            ltres: 1,
                            qtres: 1,
                            pathomit: 8,
                            colorsampling: 0,
                            numberofcolors: 2,
                            strokewidth: 0,
                            linefilter: false
                        });
                        const engSvgFinalStr = cleanSvgPaths(rawEngSvg);
                        const scaledEngSvgStr = adjustSvgPhysicalDimensions(engSvgFinalStr, W_val, H_val);
                        setEngSvgData('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(scaledEngSvgStr));
                        
                        // Create Combined Preview SVG
                        const engDoc = parser.parseFromString(scaledEngSvgStr, 'image/svg+xml');
                        const combinedDoc = parser.parseFromString(cutSvgFinalStr, 'image/svg+xml');
                        const combinedSvgElement = combinedDoc.querySelector('svg');
                        
                        const engPaths = engDoc.querySelectorAll('path');
                        engPaths.forEach(path => {
                            const clonedPath = path.cloneNode(true);
                            clonedPath.setAttribute('fill', '#000000');
                            combinedSvgElement.appendChild(clonedPath);
                        });
                        
                        const combinedSvgStr = new XMLSerializer().serializeToString(combinedDoc);
                        setSvgData('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(combinedSvgStr));
                    }
                    
                    setIsProcessing(false);
                };
                imgObj.src = image;
            } catch (err) {
                setError(err.message);
                setIsProcessing(false);
            }
        }, 50);
    };

    const downloadSvg = () => {
        if (!svgData) return;
        const a = document.createElement('a');
        a.href = svgData;
        a.download = `${fileName}.svg`;
        a.click();
    };

    const downloadCutSvg = () => {
        if (!cutSvgData) return;
        const a = document.createElement('a');
        a.href = cutSvgData;
        a.download = `${fileName}_cut.svg`;
        a.click();
    };

    const downloadEngSvg = () => {
        if (!engSvgData) return;
        const a = document.createElement('a');
        a.href = engSvgData;
        a.download = `${fileName}_eng.svg`;
        a.click();
    };    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="preview-area" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="preview-box" onClick={() => inputRef.current.click()} style={{ cursor: 'pointer', minHeight: '300px' }} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
                    <div className="label" style={{ fontSize: '10px', color: '#555', marginBottom: '10px' }}>01. SOURCE IMAGE {dims && `(${dims})`}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px' }}>
                        {!image ? <Upload style={{ opacity: 0.1 }} size={64} /> : <img src={image} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
                    </div>
                </div>
                <div className="preview-box" style={{ minHeight: '300px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div className="label" style={{ fontSize: '10px', color: '#555' }}>02. VECTOR OUTPUT</div>
                        {cncMode && svgData && (
                            <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                {[
                                    { id: 'combined', label: 'Combined' },
                                    { id: 'cut', label: 'Cut Outline' },
                                    { id: 'eng', label: 'Engrave Details' }
                                ].map(tab => (
                                    <button key={tab.id} onClick={() => setPreviewTab(tab.id)} style={{
                                        fontSize: '9px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                        backgroundColor: previewTab === tab.id ? '#6366f1' : 'transparent',
                                        color: previewTab === tab.id ? '#fff' : '#aaa',
                                        transition: 'all 0.2s'
                                    }}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #333', minHeight: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {svgData ? (
                            <img 
                                src={
                                    !cncMode ? svgData : 
                                    previewTab === 'combined' ? svgData : 
                                    previewTab === 'cut' ? cutSvgData : 
                                    engSvgData
                                } 
                                style={{ maxWidth: '95%', maxHeight: '240px', objectFit: 'contain', borderRadius: '8px', display: 'block' }} 
                                alt="Vector output" 
                            />
                        ) : (
                            <ImageIcon opacity={0.1} size={64} color="#aaa" />
                        )}
                    </div>
                </div>
            </div>

            {error && <div style={{ color: '#ef4444', fontSize: '12px', textAlign: 'center' }}>{error}</div>}
            <input ref={inputRef} type="file" hidden onChange={e => loadImage(e.target.files[0])} />

            {image && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '30px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    
                    {/* Top Row: CNC Mode Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px' }}>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>CNC Prep Mode</div>
                            <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Split the SVG into separate cut (outer line) and engrave (inner details) paths.</div>
                        </div>
                        <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={cncMode} onChange={e => handleSettingChange(setCncMode, e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                            <span style={{ 
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                                backgroundColor: cncMode ? '#6366f1' : '#333', transition: '.4s', borderRadius: '34px',
                                boxShadow: cncMode ? '0 0 10px rgba(99, 102, 241, 0.4)' : 'none'
                            }}>
                                <span style={{
                                    position: 'absolute', height: '18px', width: '18px', left: cncMode ? '28px' : '4px', bottom: '4px',
                                    backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                }}></span>
                            </span>
                        </label>
                    </div>

                    {/* Middle Row: Settings Columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: cncMode ? '1fr 1fr' : '1fr', gap: '30px' }}>
                        {/* Column 1: Threshold & Physical Size */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '10px', fontWeight: 'bold' }}>
                                    <span>B&W Threshold</span><span>{threshold}</span>
                                </div>
                                <input type="range" min="0" max="255" step="1" value={threshold} onChange={e => handleSettingChange(setThreshold, parseInt(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                                <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>Adjust this to capture more or fewer details in the black/white conversion.</div>
                            </div>

                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>Set Physical Dimensions</span>
                                        <span style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>Embed real-world dimensions (cm) in the SVG for CNC/lasers.</span>
                                    </div>
                                    <input type="checkbox" checked={usePhysicalSize} onChange={e => handleSettingChange(setUsePhysicalSize, e.target.checked)} style={{ accentColor: '#6366f1', cursor: 'pointer', width: '16px', height: '16px' }} />
                                </div>
                                
                                {usePhysicalSize && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '10px', paddingLeft: '10px', borderLeft: '2px solid #6366f1' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '4px', fontWeight: 'bold' }}>Height (cm)</div>
                                            <input type="number" min="0.1" max="1000" step="0.1" value={physicalHeight} onChange={e => handleSettingChange(setPhysicalHeight, parseFloat(e.target.value) || 0)} style={{ 
                                                width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '12px', fontWeight: 'bold'
                                            }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#888', marginBottom: '4px', fontWeight: 'bold' }}>Calculated Width</div>
                                            <div style={{ 
                                                width: '100%', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                                borderRadius: '8px', padding: '8px 12px', color: '#888', fontSize: '12px', fontWeight: 'bold'
                                            }}>
                                                {getCalculatedWidth()}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        </div>

                        {/* Column 2: CNC Settings */}
                        {cncMode && (
                            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '10px', fontWeight: 'bold' }}>
                                        <span>Outer Line Trim Offset</span><span>{trimWidth} px</span>
                                    </div>
                                    <input type="range" min="1" max="15" step="1" value={trimWidth} onChange={e => handleSettingChange(setTrimWidth, parseInt(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                                    <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>Adjust trim radius to erase the outermost cut lines from the engraving path.</div>
                                </div>

                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>Add Keytag Hole</span>
                                            <span style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>Injects a cutting circle at the topmost profile.</span>
                                        </div>
                                        <input type="checkbox" checked={keytagHole} onChange={e => handleSettingChange(setKeytagHole, e.target.checked)} style={{ accentColor: '#6366f1', cursor: 'pointer', width: '16px', height: '16px' }} />
                                    </div>
                                    
                                    {keytagHole && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '10px', borderLeft: '2px solid #6366f1', marginTop: '10px' }}>
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '4px', fontWeight: 'bold' }}>
                                                    <span>Hole Radius</span><span>{holeRadius} px</span>
                                                </div>
                                                <input type="range" min="2" max="20" step="1" value={holeRadius} onChange={e => handleSettingChange(setHoleRadius, parseInt(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '4px', fontWeight: 'bold' }}>
                                                        <span>Vertical Offset</span><span>{holeOffset} px</span>
                                                    </div>
                                                    <input type="range" min="5" max="100" step="1" value={holeOffset} onChange={e => handleSettingChange(setHoleOffset, parseInt(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                                                </div>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', textTransform: 'uppercase', color: '#6366f1', marginBottom: '4px', fontWeight: 'bold' }}>
                                                        <span>Horizontal Shift</span><span>{holeOffsetX > 0 ? `+${holeOffsetX}` : holeOffsetX} px</span>
                                                    </div>
                                                    <input type="range" min="-150" max="150" step="1" value={holeOffsetX} onChange={e => handleSettingChange(setHoleOffsetX, parseInt(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#6366f1', fontWeight: 'bold' }}>Cut Line Color</span>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                            {[
                                                { label: 'Red', color: '#ef4444' },
                                                { label: 'Blue', color: '#3b82f6' },
                                                { label: 'Black', color: '#000000' }
                                            ].map(opt => (
                                                <button key={opt.color} onClick={() => handleSettingChange(setCutColor, opt.color)} style={{ 
                                                    padding: '6px 12px', fontSize: '11px', borderRadius: '8px', fontWeight: 'bold',
                                                    border: '1px solid', borderColor: cutColor === opt.color ? opt.color : 'rgba(255,255,255,0.1)',
                                                    backgroundColor: cutColor === opt.color ? `${opt.color}20` : 'rgba(255,255,255,0.02)',
                                                    color: cutColor === opt.color ? '#fff' : '#aaa', cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#6366f1', fontWeight: 'bold' }}>Engrave Filter</span>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#aaa', marginTop: '10px' }}>
                                            <input type="checkbox" checked={excludeOuterFromEng} onChange={e => handleSettingChange(setExcludeOuterFromEng, e.target.checked)} style={{ accentColor: '#6366f1', cursor: 'pointer' }} />
                                            Exclude outer outline
                                        </label>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Bottom Row: Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                        <button onClick={processVectorization} disabled={isProcessing} className="btn-primary" style={{ padding: '15px 30px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold' }}>
                            {isProcessing ? <RotateCcw className="spin" size={18} /> : <Play size={18} />} {svgData ? "Re-Trace" : "Trace to Vector"}
                        </button>
                        
                        {svgData && !cncMode && (
                            <button onClick={downloadSvg} className="btn-secondary" style={{ padding: '15px 30px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                                <Download size={18} /> Download SVG
                            </button>
                        )}

                        {svgData && cncMode && (
                            <>
                                <button onClick={downloadCutSvg} className="btn-secondary" style={{ padding: '15px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: cutColor === '#000000' ? '#4b5563' : cutColor, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                                    <Download size={18} /> Download Cut (_cut)
                                </button>
                                <button onClick={downloadEngSvg} className="btn-secondary" style={{ padding: '15px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                                    <Download size={18} /> Download Engrave (_eng)
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default VectorizerModule;
