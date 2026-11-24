import React, { useState, useRef, useCallback } from 'react';
import { Upload, Scissors, Layers, RefreshCw, Download } from 'lucide-react';
import ImageTracer from 'imagetracerjs';

const LayeredKeytagsModule = () => {
    const [imageSrc, setImageSrc] = useState(null);
    const [imageName, setImageName] = useState('layered_artwork');
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Results
    const [croppedUrl, setCroppedUrl] = useState(null);
    const [overallOutlineUrl, setOverallOutlineUrl] = useState(null);
    const [overallSolidUrl, setOverallSolidUrl] = useState(null);
    const [colorRemovedUrl, setColorRemovedUrl] = useState(null);
    const [innerOutlineUrl, setInnerOutlineUrl] = useState(null);
    const [innerSolidUrl, setInnerSolidUrl] = useState(null);

    const fileInputRef = useRef(null);

    const loadFile = useCallback((file) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setImageSrc(ev.target.result);
            setImageName(file.name.replace(/\.[^/.]+$/, ''));
            setCroppedUrl(null);
            setOverallOutlineUrl(null);
            setOverallSolidUrl(null);
            setColorRemovedUrl(null);
            setInnerOutlineUrl(null);
            setInnerSolidUrl(null);
        };
        reader.readAsDataURL(file);
    }, []);

    const processImages = () => {
        if (!imageSrc) return;
        setIsProcessing(true);

        setTimeout(() => {
            const img = new Image();
            img.onload = () => {
                const W = img.naturalWidth;
                const H = img.naturalHeight;

                const canvas = document.createElement('canvas');
                canvas.width = W; canvas.height = H;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, W, H);
                const data = ctx.getImageData(0, 0, W, H).data;

                const colorDist = (r1, g1, b1, r2, g2, b2) => Math.abs(r1-r2) + Math.abs(g1-g2) + Math.abs(b1-b2);
                
                // 1. Crop Image (Find bounding box of non-white pixels)
                let minX = W, maxX = 0, minY = H, maxY = 0;
                let hasContent = false;
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const i = (y * W + x) * 4;
                        if (data[i+3] > 20 && colorDist(data[i], data[i+1], data[i+2], 255, 255, 255) > 40) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                            hasContent = true;
                        }
                    }
                }
                if (!hasContent) { setIsProcessing(false); return; }

                const pad = 15;
                minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
                maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
                const cW = maxX - minX + 1, cH = maxY - minY + 1;

                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = cW; cropCanvas.height = cH;
                const cropCtx = cropCanvas.getContext('2d');
                cropCtx.putImageData(ctx.getImageData(minX, minY, cW, cH), 0, 0);
                setCroppedUrl(cropCanvas.toDataURL('image/png'));

                const cd = cropCtx.getImageData(0, 0, cW, cH).data;

                // 2. Flood fill Exterior White
                const exteriorMask = new Uint8Array(cW * cH);
                const q = new Int32Array(cW * cH * 2);
                let head = 0, tail = 0;
                
                const tryPush = (x, y) => {
                    if (x < 0 || x >= cW || y < 0 || y >= cH) return;
                    const idx = y * cW + x;
                    if (exteriorMask[idx] === 0) {
                        const i = idx * 4;
                        if (cd[i+3] < 50 || colorDist(cd[i], cd[i+1], cd[i+2], 255, 255, 255) < 50) {
                            exteriorMask[idx] = 1;
                            q[tail++] = x; q[tail++] = y;
                        }
                    }
                };
                
                for(let x=0; x<cW; x++) { tryPush(x,0); tryPush(x,cH-1); }
                for(let y=0; y<cH; y++) { tryPush(0,y); tryPush(cW-1,y); }
                
                while(head < tail) {
                    const cx = q[head++], cy = q[head++];
                    tryPush(cx-1, cy); tryPush(cx+1, cy); tryPush(cx, cy-1); tryPush(cx, cy+1);
                }

                const totalMapMask = new Uint8Array(cW * cH);
                for (let i = 0; i < cW * cH; i++) totalMapMask[i] = exteriorMask[i] === 0 ? 1 : 0;

                // 3. Find Blue Fill (dominant color that is not White and not Black)
                const colorCounts = new Map();
                for (let i = 0; i < cW * cH; i++) {
                    if (totalMapMask[i] === 1) {
                        const p = i * 4;
                        const r = cd[p], g = cd[p+1], b = cd[p+2];
                        const max = Math.max(r,g,b), min = Math.min(r,g,b);
                        const l = (max + min) / 2;
                        if (l > 40 && l < 230 && colorDist(r,g,b, 255,255,255) > 60) {
                            const key = `${Math.floor(r/10)},${Math.floor(g/10)},${Math.floor(b/10)}`;
                            colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
                        }
                    }
                }
                let bestKey = null, maxCount = 0;
                for (let [key, count] of colorCounts.entries()) {
                    if (count > maxCount) { maxCount = count; bestKey = key; }
                }
                let blueR = 38, blueG = 75, blueB = 110; // defaults
                if (bestKey) {
                    const parts = bestKey.split(',').map(Number);
                    blueR = parts[0]*10; blueG = parts[1]*10; blueB = parts[2]*10;
                }

                const blueMask = new Uint8Array(cW * cH);
                for (let i = 0; i < cW * cH; i++) {
                    if (totalMapMask[i] === 1) {
                        const p = i * 4;
                        if (colorDist(cd[p], cd[p+1], cd[p+2], blueR, blueG, blueB) < 70) {
                            blueMask[i] = 1;
                        }
                    }
                }

                // 4. Distance Transform from Exterior (Blocked by Blue)
                const dExt = new Int32Array(cW * cH).fill(9999);
                const qExt = new Int32Array(cW * cH * 2);
                let qeHead = 0, qeTail = 0;
                
                for (let i = 0; i < cW * cH; i++) {
                    if (totalMapMask[i] === 0) { // Exterior
                        dExt[i] = 0;
                        qExt[qeTail++] = i % cW;
                        qExt[qeTail++] = Math.floor(i / cW);
                    }
                }
                
                while (qeHead < qeTail) {
                    const cx = qExt[qeHead++];
                    const cy = qExt[qeHead++];
                    const currDist = dExt[cy * cW + cx];
                    
                    const nbs = [ [cx-1, cy], [cx+1, cy], [cx, cy-1], [cx, cy+1] ];
                    for (let [nx, ny] of nbs) {
                        if (nx >= 0 && nx < cW && ny >= 0 && ny < cH) {
                            const nIdx = ny * cW + nx;
                            if (blueMask[nIdx] === 1) continue; // DO NOT cross blue!
                            
                            if (dExt[nIdx] > currDist + 1) {
                                dExt[nIdx] = currDist + 1;
                                qExt[qeTail++] = nx;
                                qExt[qeTail++] = ny;
                            }
                        }
                    }
                }

                // 5. Distance Transform from Blue
                const dBlue = new Int32Array(cW * cH).fill(9999);
                const qBlue = new Int32Array(cW * cH * 2);
                let qbHead = 0, qbTail = 0;
                
                for (let i = 0; i < cW * cH; i++) {
                    if (blueMask[i] === 1) {
                        dBlue[i] = 0;
                        qBlue[qbTail++] = i % cW;
                        qBlue[qbTail++] = Math.floor(i / cW);
                    }
                }
                
                while (qbHead < qbTail) {
                    const cx = qBlue[qbHead++];
                    const cy = qBlue[qbHead++];
                    const currDist = dBlue[cy * cW + cx];
                    
                    const nbs = [ [cx-1, cy], [cx+1, cy], [cx, cy-1], [cx, cy+1] ];
                    for (let [nx, ny] of nbs) {
                        if (nx >= 0 && nx < cW && ny >= 0 && ny < cH) {
                            const nIdx = ny * cW + nx;
                            if (dBlue[nIdx] > currDist + 1) {
                                dBlue[nIdx] = currDist + 1;
                                qBlue[qbTail++] = nx;
                                qBlue[qbTail++] = ny;
                            }
                        }
                    }
                }

                // 6. ForegroundMask is anything non-blue and non-exterior, EXCLUDING the top map outline
                const foregroundMask = new Uint8Array(cW * cH);
                const R = Math.max(30, Math.floor(Math.min(cW, cH) * 0.05)); // Outline Severing Threshold
                
                for (let i = 0; i < cW * cH; i++) {
                    if (totalMapMask[i] === 1 && blueMask[i] === 0) {
                        const p = i * 4;
                        const isWhite = colorDist(cd[p], cd[p+1], cd[p+2], 255, 255, 255) < 80;
                        
                        // If it's a black/gray line AND it's trapped tightly between Exterior and Blue...
                        if (!isWhite && (dExt[i] + dBlue[i] <= R)) {
                            // It's the top map outline! Sever it.
                            foregroundMask[i] = 0;
                        } else {
                            // It's inner graphics (palm trees, beach, etc.) or bottom outline
                            foregroundMask[i] = 1;
                        }
                    }
                }

                // Outline function
                const generateOutline = (mask, strokeRadius) => {
                    const out = cropCtx.createImageData(cW, cH);
                    const od = out.data;
                    for (let y = 0; y < cH; y++) {
                        for (let x = 0; x < cW; x++) {
                            const idx = y * cW + x;
                            if (mask[idx] === 1) {
                                let isEdge = false;
                                for (let dy = -strokeRadius; dy <= strokeRadius; dy++) {
                                    for (let dx = -strokeRadius; dx <= strokeRadius; dx++) {
                                        if (dx*dx + dy*dy <= strokeRadius*strokeRadius) {
                                            const nx = x + dx, ny = y + dy;
                                            if (nx < 0 || nx >= cW || ny < 0 || ny >= cH || mask[ny * cW + nx] === 0) {
                                                isEdge = true; break;
                                            }
                                        }
                                    }
                                    if (isEdge) break;
                                }
                                const outIdx = idx * 4;
                                if (isEdge) { od[outIdx] = od[outIdx+1] = od[outIdx+2] = 0; od[outIdx+3] = 255; }
                            }
                        }
                    }
                    return out;
                };

                // Helper to generate solid mask for SVG single-line tracing
                const generateSolid = (mask) => {
                    const out = cropCtx.createImageData(cW, cH);
                    const od = out.data;
                    for (let y = 0; y < cH; y++) {
                        for (let x = 0; x < cW; x++) {
                            const idx = y * cW + x;
                            const outIdx = idx * 4;
                            if (mask[idx] === 1) {
                                od[outIdx] = od[outIdx+1] = od[outIdx+2] = 0; od[outIdx+3] = 255;
                            } else {
                                od[outIdx] = od[outIdx+1] = od[outIdx+2] = 255; od[outIdx+3] = 255;
                            }
                        }
                    }
                    return out;
                };

                // Output 1: Overall Outline (Outline of TotalMapMask)
                const outline1 = generateOutline(totalMapMask, 1);
                const cv1 = document.createElement('canvas'); cv1.width = cW; cv1.height = cH;
                cv1.getContext('2d').putImageData(outline1, 0, 0);
                setOverallOutlineUrl(cv1.toDataURL('image/png'));
                
                const solid1 = generateSolid(totalMapMask);
                const cv1s = document.createElement('canvas'); cv1s.width = cW; cv1s.height = cH;
                cv1s.getContext('2d').putImageData(solid1, 0, 0);
                setOverallSolidUrl(cv1s.toDataURL('image/png'));

                // Output 2: Inner Elements (Masked by ForegroundMask)
                const innerImg = cropCtx.createImageData(cW, cH);
                for (let i = 0; i < cW * cH; i++) {
                    if (foregroundMask[i] === 1) {
                        const p = i * 4;
                        // To make white background transparent for engraving layer if needed. 
                        // But user wants white beach to be white.
                        innerImg.data[p] = cd[p]; innerImg.data[p+1] = cd[p+1]; innerImg.data[p+2] = cd[p+2]; innerImg.data[p+3] = cd[p+3];
                    }
                }
                const cv2 = document.createElement('canvas'); cv2.width = cW; cv2.height = cH;
                cv2.getContext('2d').putImageData(innerImg, 0, 0);
                setColorRemovedUrl(cv2.toDataURL('image/png'));

                // Output 3: Inner Outline (Outline of ForegroundMask)
                const outline3 = generateOutline(foregroundMask, 1);
                const cv3 = document.createElement('canvas'); cv3.width = cW; cv3.height = cH;
                cv3.getContext('2d').putImageData(outline3, 0, 0);
                setInnerOutlineUrl(cv3.toDataURL('image/png'));

                const solid3 = generateSolid(foregroundMask);
                const cv3s = document.createElement('canvas'); cv3s.width = cW; cv3s.height = cH;
                cv3s.getContext('2d').putImageData(solid3, 0, 0);
                setInnerSolidUrl(cv3s.toDataURL('image/png'));

                setIsProcessing(false);
            };
            img.src = imageSrc;
        }, 50);
    };

    const handleDownload = (url, suffix) => {
        if (!url) return;
        
        const colsStr = window.prompt("Enter number of columns (n):", "3");
        if (!colsStr) return;
        const rowsStr = window.prompt("Enter number of rows (m):", "4");
        if (!rowsStr) return;
        
        const n = parseInt(colsStr, 10);
        const m = parseInt(rowsStr, 10);
        
        if (isNaN(n) || isNaN(m) || n <= 0 || m <= 0) {
            window.alert("Invalid dimensions");
            return;
        }

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width * n;
            canvas.height = img.height * m;
            const ctx = canvas.getContext('2d');
            
            for (let y = 0; y < m; y++) {
                for (let x = 0; x < n; x++) {
                    ctx.drawImage(img, x * img.width, y * img.height);
                }
            }
            
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${imageName}_${suffix}_${n}x${m}.png`;
            a.click();
        };
        img.src = url;
    };

    const handleDownloadSvg = (url, suffix, isSolid = false) => {
        if (!url) return;
        setIsProcessing(true);
        setTimeout(() => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                
                // Draw a white background first just in case
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, img.width, img.height);
                ctx.drawImage(img, 0, 0);
                
                // Strict B/W threshold to eliminate noise and anti-aliasing
                const imgData = ctx.getImageData(0, 0, img.width, img.height);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
                    const l = (Math.max(r,g,b) + Math.min(r,g,b)) / 2;
                    
                    if (a < 100 || l > 150) { // Transparent or Light = White Background
                        d[i] = d[i+1] = d[i+2] = 255;
                        d[i+3] = 255;
                    } else { // Solid Dark = Black Line
                        d[i] = d[i+1] = d[i+2] = 0;
                        d[i+3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
                const cleanUrl = canvas.toDataURL('image/png');

                const options = {
                    corsenabled: false, ltres: 1, qtres: 1, pathomit: 16, rightangleenhance: true,
                    colorsampling: 0, numberofcolors: 2, mincolorratio: 0, colorquantcycles: 1,
                    blurradius: 0, blurdelta: 20, strokewidth: 1, linefilter: false, scale: 1,
                    roundcoords: 1, viewbox: true, desc: false, lcpr: 0, qcpr: 0,
                };
                
                ImageTracer.imageToSVG(cleanUrl, (svgstr) => {
                    // If we traced a solid image, convert the black solid fill to a single black outline path
                    if (isSolid) {
                        svgstr = svgstr.replace(/fill="rgb\(0,0,0\)"/g, 'fill="none" stroke="rgb(0,0,0)" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"');
                    }
                    
                    const blob = new Blob([svgstr], { type: 'image/svg+xml' });
                    const svgUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = svgUrl;
                    a.download = `${imageName}_${suffix}.svg`;
                    a.click();
                    URL.revokeObjectURL(svgUrl);
                    setIsProcessing(false);
                }, options);
            };
            img.src = url;
        }, 50);
    };

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", color: '#fff' }}>
            <div style={{ marginBottom: '28px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '6px' }}>
                    Layered Keytags
                    <span style={{ marginLeft: '10px', fontSize: '11px', fontWeight: '500', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', verticalAlign: 'middle' }}>
                        Auto-Crop & Layer Extraction
                    </span>
                </h2>
                <p style={{ fontSize: '12px', color: '#555', letterSpacing: '0.02em' }}>
                    Upload layered artwork. We automatically crop it and extract the overall outline, inner layers, and layer outlines.
                </p>
            </div>

            <div
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]); }}
                style={{
                    border: `2px dashed ${imageSrc ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '24px', padding: imageSrc ? '20px' : '60px 20px',
                    textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)',
                    marginBottom: '28px',
                }}
            >
                {!imageSrc ? (
                    <div onClick={() => fileInputRef.current?.click()} style={{ cursor: 'pointer' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <Layers size={24} color="#6366f1" />
                        </div>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: '#ccc', marginBottom: '6px' }}>Drop layered artwork here or click</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Source Image</p>
                            <img src={imageSrc} alt="source" style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '10px', display: 'block', background: 'rgba(255,255,255,0.04)' }} />
                            <button onClick={() => fileInputRef.current?.click()} style={{ marginTop: '12px', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                                Change Image
                            </button>
                        </div>
                        {croppedUrl && (
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Cropped Bounds</p>
                                <img src={croppedUrl} alt="cropped" style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '10px', display: 'block', background: 'rgba(255,255,255,0.04)' }} />
                            </div>
                        )}
                    </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => loadFile(e.target.files?.[0])} />
            </div>

            {imageSrc && (
                <div style={{ marginBottom: '28px' }}>
                    <button
                        onClick={processImages}
                        disabled={isProcessing}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '14px', cursor: isProcessing ? 'not-allowed' : 'pointer',
                            fontWeight: '700', fontSize: '13px', opacity: isProcessing ? 0.6 : 1, transition: 'all 0.2s ease',
                        }}
                    >
                        <RefreshCw size={15} className={isProcessing ? 'spin' : ''} />
                        {isProcessing ? 'Processing Layers...' : 'Process Layers'}
                    </button>
                </div>
            )}

            {overallSolidUrl && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                    
                    {/* 1. Overall Outline */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px', color: '#fff' }}>1. Overall Silhouette</p>
                        <img src={overallSolidUrl} alt="Overall Outline" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', background: '#fff', borderRadius: '8px', marginBottom: '12px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => handleDownload(overallSolidUrl, 'overall_silhouette')} style={{ flex: 1, background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                                <Download size={14} /> PNG
                            </button>
                            <button onClick={() => handleDownloadSvg(overallSolidUrl, 'overall_outline', true)} style={{ flex: 1, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                                <Download size={14} /> SVG
                            </button>
                        </div>
                    </div>

                    {/* 2. Color Removed */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px', color: '#fff' }}>2. Inner Engrave Layer</p>
                        <img src={colorRemovedUrl} alt="Inner Layer" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', background: '#e5e7eb', borderRadius: '8px', marginBottom: '12px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => handleDownload(colorRemovedUrl, 'inner_layer')} style={{ flex: 1, background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                                <Download size={14} /> PNG
                            </button>
                            <button onClick={() => handleDownloadSvg(colorRemovedUrl, 'inner_layer', false)} style={{ flex: 1, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                                <Download size={14} /> SVG
                            </button>
                        </div>
                    </div>

                    {/* 3. Inner Outline */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px', color: '#fff' }}>3. Inner Silhouette</p>
                        <img src={innerSolidUrl} alt="Inner Outline" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', background: '#fff', borderRadius: '8px', marginBottom: '12px' }} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => handleDownload(innerSolidUrl, 'inner_silhouette')} style={{ flex: 1, background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                                <Download size={14} /> PNG
                            </button>
                            <button onClick={() => handleDownloadSvg(innerSolidUrl, 'inner_outline', true)} style={{ flex: 1, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                                <Download size={14} /> SVG
                            </button>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default LayeredKeytagsModule;
