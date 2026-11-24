import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, RefreshCw, Heart, Square as SquareIcon, Circle as CircleIcon, Move, Play } from 'lucide-react';
import ImageTracer from 'imagetracerjs';
import ArtworkPrepModule from '../ArtworkPrep/ArtworkPrepModule';
import LayeredKeytagsModule from './LayeredKeytagsModule';

// Seamless dark check pattern for transparency display
const transparentPattern = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="10" fill="%23141414"/><rect x="10" width="10" height="10" fill="%230b0b0b"/><rect y="10" width="10" height="10" fill="%230b0b0b"/><rect x="10" y="10" width="10" height="10" fill="%23141414"/></svg>';

// Default image: beautiful geometric/studio profile silhouette in SVG format
const DEFAULT_IMAGE = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%236366f1"/><stop offset="100%" stop-color="%238b5cf6"/></linearGradient></defs><rect width="400" height="400" fill="url(%23g)"/><circle cx="200" cy="150" r="65" fill="%23ffffff" opacity="0.95"/><path d="M110,290 C110,230 145,210 200,210 C255,210 290,230 290,290 Z" fill="%23ffffff" opacity="0.95"/><text x="200" y="350" fill="%23ffffff" font-family="'Inter', sans-serif" font-size="18" font-weight="bold" letter-spacing="1" text-anchor="middle">LUMORA KEY TAGS</text></svg>`;

const cleanSvgPaths = (svgString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const paths = doc.querySelectorAll('path');
    paths.forEach(path => {
        const opacity = path.getAttribute('opacity');
        const fill = path.getAttribute('fill');
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

const KeyTagsModule = () => {
    const [activeTab, setActiveTab] = useState('standard'); // 'standard' | 'custom'
    const [imageSrc, setImageSrc] = useState(DEFAULT_IMAGE);
    const [imageAspectRatio, setImageAspectRatio] = useState(1.0);
    const [fileName, setFileName] = useState('lumora_keytag');
    const [isTracing, setIsTracing] = useState(false);
    const [customPathData, setCustomPathData] = useState(null);
    const [shapeImageSrc, setShapeImageSrc] = useState(null);
    const [shapeFileName, setShapeFileName] = useState('');
    const shapeFileInputRef = useRef(null);

    // Batch Export State
    const [boardWidth, setBoardWidth] = useState(600);
    const [boardHeight, setBoardHeight] = useState(400);
    const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
    const [batchStandardShape, setBatchStandardShape] = useState('square');
    
    // Interlocking State
    const [isInterlocked, setIsInterlocked] = useState(false);
    const [interlockSqueeze, setInterlockSqueeze] = useState(10); // Y-axis squeeze in mm
    const [interlockShift, setInterlockShift] = useState(25); // X-axis offset in mm

    // Individual configurations for each shape
    const [tagConfigs, setTagConfigs] = useState({
        square: {
            width: 50,
            height: 50,
            borderRadius: 8,
            borderWidth: 3,
            imageX: 0,
            imageY: 0,
            imageScale: 1.0,
            holeX: 25,
            holeY: 8,
            holeDiameter: 4.5,
            showHole: true,
        },
        heart: {
            width: 55,
            height: 50,
            borderWidth: 3,
            imageX: 0,
            imageY: 0,
            imageScale: 1.0,
            holeX: 27.5,
            holeY: 10,
            holeDiameter: 4.5,
            showHole: true,
        },
        circle: {
            width: 50,
            height: 50,
            borderWidth: 3,
            imageX: 0,
            imageY: 0,
            imageScale: 1.0,
            holeX: 25,
            holeY: 8,
            holeDiameter: 4.5,
            showHole: true,
        },
        custom: {
            width: 50,
            height: 50,
            borderWidth: 3,
            imageX: 0,
            imageY: 0,
            imageScale: 1.0,
            holeX: 25,
            holeY: 8,
            holeDiameter: 4.5,
            showHole: true,
        }
    });

    const fileInputRef = useRef(null);
    const svgRefs = {
        square: useRef(null),
        heart: useRef(null),
        circle: useRef(null),
        custom: useRef(null),
    };

    // Drag state for interactive mouse operations
    const [dragState, setDragState] = useState(null);

    // Load uploaded artwork file
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    setImageSrc(event.target.result);
                    setImageAspectRatio(img.naturalWidth / img.naturalHeight);
                    setFileName(file.name.replace(/\.[^/.]+$/, ""));
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    // Load uploaded shape file
    const handleShapeFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setShapeImageSrc(event.target.result);
                setShapeFileName(file.name.replace(/\.[^/.]+$/, ""));
                setCustomPathData(null); // Reset trace on new shape
                // We'll let the user explicitly click 'Trace' to avoid blocking immediately
            };
            reader.readAsDataURL(file);
        }
    };

    const traceCustomOutline = () => {
        if (!shapeImageSrc) return;
        setIsTracing(true);
        setTimeout(() => {
            try {
                const imgObj = new Image();
                imgObj.onload = () => {
                    let W = imgObj.naturalWidth;
                    let H = imgObj.naturalHeight;
                    const maxDim = 500; // Cap resolution for tracing speed
                    if (W > maxDim || H > maxDim) {
                        const scale = maxDim / Math.max(W, H);
                        W = Math.floor(W * scale);
                        H = Math.floor(H * scale);
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = W;
                    canvas.height = H;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(imgObj, 0, 0, W, H);
                    const imgData = ctx.getImageData(0, 0, W, H);
                    const data = imgData.data;

                    const fg = new Uint8Array(W * H);
                    for (let i = 0; i < W * H; i++) {
                        const r = data[i*4];
                        const g = data[i*4+1];
                        const b = data[i*4+2];
                        const a = data[i*4+3];
                        const avg = (r + g + b) / 3;
                        // Assuming line-art on white or transparent bg
                        if (a > 50 && avg < 240) {
                            fg[i] = 1;
                        }
                    }

                    const dilatedFg = dilateMask(fg, W, H, 3);
                    const visited = new Uint8Array(W * H);
                    const queue = [];
                    
                    for (let x = 0; x < W; x++) {
                        if (dilatedFg[x] === 0 && visited[x] === 0) { visited[x] = 1; queue.push(x); }
                        const bot = (H - 1) * W + x;
                        if (dilatedFg[bot] === 0 && visited[bot] === 0) { visited[bot] = 1; queue.push(bot); }
                    }
                    for (let y = 0; y < H; y++) {
                        const left = y * W;
                        if (dilatedFg[left] === 0 && visited[left] === 0) { visited[left] = 1; queue.push(left); }
                        const right = y * W + (W - 1);
                        if (dilatedFg[right] === 0 && visited[right] === 0) { visited[right] = 1; queue.push(right); }
                    }
                    
                    let head = 0;
                    while (head < queue.length) {
                        const idx = queue[head++];
                        const x = idx % W;
                        const y = Math.floor(idx / W);
                        
                        const neighbors = [[x+1, y], [x-1, y], [x, y+1], [x, y-1]];
                        for (const [nx, ny] of neighbors) {
                            if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                                const nidx = ny * W + nx;
                                if (visited[nidx] === 0 && dilatedFg[nidx] === 0) {
                                    visited[nidx] = 1;
                                    queue.push(nidx);
                                }
                            }
                        }
                    }

                    const finalBg = dilateMask(visited, W, H, 3);
                    const cutImgData = ctx.createImageData(W, H);
                    let minX = W, maxX = 0, minY = H, maxY = 0;
                    let found = false;

                    for (let y = 0; y < H; y++) {
                        for (let x = 0; x < W; x++) {
                            const i = y * W + x;
                            const pIdx = i * 4;
                            if (finalBg[i] === 0) {
                                cutImgData.data[pIdx] = 0;
                                cutImgData.data[pIdx+1] = 0;
                                cutImgData.data[pIdx+2] = 0;
                                cutImgData.data[pIdx+3] = 255;
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                                if (y < minY) minY = y;
                                if (y > maxY) maxY = y;
                                found = true;
                            } else {
                                cutImgData.data[pIdx] = 255;
                                cutImgData.data[pIdx+1] = 255;
                                cutImgData.data[pIdx+2] = 255;
                                cutImgData.data[pIdx+3] = 0;
                            }
                        }
                    }

                    if (!found) {
                        setIsTracing(false);
                        return;
                    }

                    const rawSvg = ImageTracer.imagedataToSVG(cutImgData, {
                        ltres: 1, qtres: 1, pathomit: 8, colorsampling: 0, numberofcolors: 2, strokewidth: 0, linefilter: false
                    });
                    
                    const cleanSvg = cleanSvgPaths(rawSvg);
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(cleanSvg, 'image/svg+xml');
                    
                    let bestD = '';
                    let maxLen = 0;
                    doc.querySelectorAll('path').forEach(p => {
                        const d = p.getAttribute('d');
                        if (d && d.length > maxLen) {
                            maxLen = d.length;
                            bestD = d;
                        }
                    });

                    if (bestD) {
                        const bbW = maxX - minX;
                        const bbH = maxY - minY;
                        setCustomPathData({
                            d: bestD,
                            boundingBox: { minX, minY, width: bbW, height: bbH }
                        });
                        
                        // Automatically adjust tag config dimension defaults for the trace
                        setTagConfigs(prev => {
                            const ratio = bbW / bbH;
                            const targetW = 60;
                            const targetH = 60 / ratio;
                            return {
                                ...prev,
                                custom: {
                                    ...prev.custom,
                                    width: targetW,
                                    height: targetH,
                                    holeX: targetW / 2,
                                    holeY: 10
                                }
                            };
                        });
                    }
                    setIsTracing(false);
                };
                imgObj.src = shapeImageSrc;
            } catch (e) {
                console.error(e);
                setIsTracing(false);
            }
        }, 50);
    };

    // Math for custom rounded rectangle drawing
    const drawRoundRect = (ctx, x, y, width, height, radius) => {
        if (radius <= 0) {
            ctx.rect(x, y, width, height);
            return;
        }
        const r = Math.min(radius, width / 2, height / 2);
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.lineTo(x + width, y + height - r);
        ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
        ctx.lineTo(x + r, y + height);
        ctx.arcTo(x, y + height, x, y + height - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
    };

    // Math for heart shape path (matching the full, plump emoji heart)
    const getHeartPath = (w, h, border = 0) => {
        const iw = w - 2 * border;
        const ih = h - 2 * border;
        const ox = border;
        const oy = border;
        if (iw <= 0 || ih <= 0) return '';
        return `M ${ox + 50*iw/100} ${oy + 22*ih/100} 
                C ${ox + 30*iw/100} ${oy + 2*ih/100}, ${ox + 0*iw/100} ${oy + 6*ih/100}, ${ox + 0*iw/100} ${oy + 40*ih/100} 
                C ${ox + 0*iw/100} ${oy + 68*ih/100}, ${ox + 28*iw/100} ${oy + 82*ih/100}, ${ox + 50*iw/100} ${oy + 98*ih/100} 
                C ${ox + 72*iw/100} ${oy + 82*ih/100}, ${ox + 100*iw/100} ${oy + 68*ih/100}, ${ox + 100*iw/100} ${oy + 40*ih/100} 
                C ${ox + 100*iw/100} ${oy + 6*ih/100}, ${ox + 70*iw/100} ${oy + 2*ih/100}, ${ox + 50*iw/100} ${oy + 22*ih/100} Z`;
    };

    // Helper to draw a shape on Canvas with adjustable border margin
    const drawShapePath = (ctx, shapeId, w_px, h_px, radius_px, border_px = 0) => {
        ctx.beginPath();
        const iw = w_px - 2 * border_px;
        const ih = h_px - 2 * border_px;
        const ox = border_px;
        const oy = border_px;

        if (iw <= 0 || ih <= 0) return;

        if (shapeId === 'square') {
            const ir = Math.max(0, radius_px - border_px);
            drawRoundRect(ctx, ox, oy, iw, ih, ir);
        } else if (shapeId === 'heart') {
            ctx.moveTo(ox + 50*iw/100, oy + 22*ih/100);
            ctx.bezierCurveTo(ox + 30*iw/100, oy + 2*ih/100, ox + 0*iw/100, oy + 6*ih/100, ox + 0*iw/100, oy + 40*ih/100);
            ctx.bezierCurveTo(ox + 0*iw/100, oy + 68*ih/100, ox + 28*iw/100, oy + 82*ih/100, ox + 50*iw/100, oy + 98*ih/100);
            ctx.bezierCurveTo(ox + 72*iw/100, oy + 82*ih/100, ox + 100*iw/100, oy + 68*ih/100, ox + 100*iw/100, oy + 40*ih/100);
            ctx.bezierCurveTo(ox + 100*iw/100, oy + 6*ih/100, ox + 70*iw/100, oy + 2*ih/100, ox + 50*iw/100, oy + 22*ih/100);
        } else if (shapeId === 'circle') {
            ctx.arc(w_px/2, w_px/2, Math.max(0, w_px/2 - border_px), 0, Math.PI*2);
        } else if (shapeId === 'custom') {
            // Placeholder for custom outline bounding rect for now
            drawRoundRect(ctx, ox, oy, iw, ih, 0);
        }
        ctx.closePath();
    };

    // Helper to generate path definitions in cut SVGs
    const getShapePathString = (shapeId, w, h, radius) => {
        if (shapeId === 'square') {
            return `<rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="none" stroke="#ef4444" stroke-width="0.1" />`;
        } else if (shapeId === 'heart') {
            return `<path d="${getHeartPath(w, h)}" fill="none" stroke="#ef4444" stroke-width="0.1" />`;
        } else if (shapeId === 'circle') {
            return `<circle cx="${w/2}" cy="${w/2}" r="${w/2}" fill="none" stroke="#ef4444" stroke-width="0.1" />`;
        }
        return '';
    };

    // Initiates keyhole dragging
    const handleHoleMouseDown = (e, shapeId) => {
        e.stopPropagation();
        e.preventDefault();
        setDragState({
            type: 'hole',
            shapeId: shapeId,
            startX: e.clientX,
            startY: e.clientY,
            initialHoleX: tagConfigs[shapeId].holeX,
            initialHoleY: tagConfigs[shapeId].holeY,
        });
    };

    // Initiates image dragging
    const handleImageMouseDown = (e, shapeId) => {
        e.preventDefault();
        setDragState({
            type: 'image',
            shapeId: shapeId,
            startX: e.clientX,
            startY: e.clientY,
            initialImageX: tagConfigs[shapeId].imageX,
            initialImageY: tagConfigs[shapeId].imageY,
        });
    };

    // Track active drag interactions
    useEffect(() => {
        if (!dragState) return;

        const handleMouseMove = (e) => {
            const { type, shapeId, startX, startY, initialHoleX, initialHoleY, initialImageX, initialImageY } = dragState;
            const config = tagConfigs[shapeId];
            const w = config.width;
            const h = shapeId === 'circle' ? w : config.height;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const svgElement = svgRefs[shapeId].current;
            if (!svgElement) return;

            const rect = svgElement.getBoundingClientRect();
            const scaleX = w / rect.width;
            const scaleY = h / rect.height;

            if (type === 'hole') {
                const deltaX_mm = dx * scaleX;
                const deltaY_mm = dy * scaleY;

                let newHoleX = initialHoleX + deltaX_mm;
                let newHoleY = initialHoleY + deltaY_mm;

                const r = config.holeDiameter / 2;

                // Handle constraints per shape
                if (shapeId === 'circle') {
                    const cx = w / 2;
                    const cy = w / 2;
                    const R = w / 2;
                    const hdx = newHoleX - cx;
                    const hdy = newHoleY - cy;
                    const dist = Math.sqrt(hdx * hdx + hdy * hdy);
                    const maxDist = R - r - 1.5; // Include safety margin

                    if (dist > maxDist) {
                        newHoleX = cx + (hdx / dist) * maxDist;
                        newHoleY = cy + (hdy / dist) * maxDist;
                    }
                } else {
                    newHoleX = Math.max(r + 1.5, Math.min(w - r - 1.5, newHoleX));
                    newHoleY = Math.max(r + 1.5, Math.min(h - r - 1.5, newHoleY));
                }

                setTagConfigs(prev => ({
                    ...prev,
                    [shapeId]: {
                        ...prev[shapeId],
                        holeX: newHoleX,
                        holeY: newHoleY
                    }
                }));
            } else if (type === 'image') {
                const deltaX_mm = dx * scaleX;
                const deltaY_mm = dy * scaleY;

                setTagConfigs(prev => ({
                    ...prev,
                    [shapeId]: {
                        ...prev[shapeId],
                        imageX: initialImageX + deltaX_mm,
                        imageY: initialImageY + deltaY_mm
                    }
                }));
            }
        };

        const handleMouseUp = () => {
            setDragState(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, tagConfigs]);

    // Reset position / scale
    const handleReset = (shapeId) => {
        setTagConfigs(prev => ({
            ...prev,
            [shapeId]: {
                ...prev[shapeId],
                imageX: 0,
                imageY: 0,
                imageScale: 1.0,
                borderWidth: 3,
                holeX: prev[shapeId].width / 2,
                holeY: shapeId === 'heart' ? 10 : 8,
                showHole: true,
            }
        }));
    };

    // Download Cut Outline Image (PNG with black lines on transparent bg)
    const handleDownloadCut = (shapeId) => {
        const config = tagConfigs[shapeId];
        let w_mm = config.width;
        let h_mm = shapeId === 'circle' ? w_mm : config.height;
        let pad_mm = 0;
        let actual_shape_w = w_mm;

        if (shapeId === 'custom' && customPathData) {
            pad_mm = 2; // 2mm padding on all sides for the bounding box
            actual_shape_w = config.width;
            const actual_shape_h = config.width * (customPathData.boundingBox.height / customPathData.boundingBox.width);
            w_mm = actual_shape_w + (pad_mm * 2);
            h_mm = actual_shape_h + (pad_mm * 2);
        }

        const radius_mm = shapeId === 'square' ? Math.min(config.borderRadius, Math.min(w_mm, h_mm) / 2) : 0;

        // 15 pixels per mm resolution (750px wide for 50mm keytag)
        const scale = 15;
        const w_px = w_mm * scale;
        const h_px = h_mm * scale;
        const r_px = radius_mm * scale;

        const canvas = document.createElement('canvas');
        canvas.width = w_px;
        canvas.height = h_px;
        const ctx = canvas.getContext('2d');

        // Clear canvas (transparent background)
        ctx.clearRect(0, 0, w_px, h_px);

        // Draw shape outer outline (black, 3px width)
        if (shapeId === 'custom' && customPathData) {
            ctx.save();
            ctx.translate(w_px/2, h_px/2); // Center of the padded canvas
            const pathScale = (actual_shape_w * scale) / customPathData.boundingBox.width;
            ctx.scale(pathScale, pathScale);
            ctx.translate(-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2), -(customPathData.boundingBox.minY + customPathData.boundingBox.height/2));
            const p = new Path2D(customPathData.d);
            
            ctx.lineWidth = 3 / pathScale;
            ctx.strokeStyle = '#000000';
            ctx.stroke(p);
            ctx.restore();
        } else {
            ctx.save();
            drawShapePath(ctx, shapeId, w_px, h_px, r_px, 0);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }

        // Draw keyhole outline (black, 3px width) — only if keyhole is enabled
        if (config.showHole) {
            ctx.save();
            ctx.beginPath();
            const holeX_px = config.holeX * scale;
            const holeY_px = config.holeY * scale;
            const holeR_px = (config.holeDiameter / 2) * scale;
            ctx.arc(holeX_px, holeY_px, holeR_px, 0, Math.PI * 2);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }

        // Download trigger
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${fileName}_${shapeId}_cut.png`;
        a.click();
    };

    // Download Engrave Image (High-Res PNG with transparency)
    const handleDownloadEngrave = (shapeId) => {
        const config = tagConfigs[shapeId];
        let w_mm = config.width;
        let h_mm = shapeId === 'circle' ? w_mm : config.height;
        let pad_mm = 0;
        let actual_shape_w = w_mm;

        if (shapeId === 'custom' && customPathData) {
            pad_mm = 2; // 2mm padding on all sides
            actual_shape_w = config.width;
            const actual_shape_h = config.width * (customPathData.boundingBox.height / customPathData.boundingBox.width);
            w_mm = actual_shape_w + (pad_mm * 2);
            h_mm = actual_shape_h + (pad_mm * 2);
        }

        const radius_mm = shapeId === 'square' ? Math.min(config.borderRadius, Math.min(w_mm, h_mm) / 2) : 0;

        // 15 pixels per mm resolution (750px wide for 50mm keytag)
        const scale = 15;
        const w_px = w_mm * scale;
        const h_px = h_mm * scale;
        const r_px = radius_mm * scale;

        const canvas = document.createElement('canvas');
        canvas.width = w_px;
        canvas.height = h_px;
        const ctx = canvas.getContext('2d');

        // Draw background path filled with solid white
        if (shapeId === 'custom' && customPathData) {
            ctx.save();
            ctx.translate(w_px/2, h_px/2); // Center of padded canvas
            const pathScale = (actual_shape_w * scale) / customPathData.boundingBox.width;
            ctx.scale(pathScale, pathScale);
            ctx.translate(-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2), -(customPathData.boundingBox.minY + customPathData.boundingBox.height/2));
            const p = new Path2D(customPathData.d);
            ctx.fillStyle = '#ffffff';
            ctx.fill(p);
            ctx.restore();
        } else {
            ctx.save();
            drawShapePath(ctx, shapeId, w_px, h_px, r_px, 0);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();
        }

        // Setup clipping mask for the image (inset by borderWidth)
        if (shapeId !== 'custom') {
            ctx.save();
            const border_px = config.borderWidth * scale;
            drawShapePath(ctx, shapeId, w_px, h_px, r_px, border_px);
            ctx.clip();
        }

        // Draw image
        const img = new Image();
        img.onload = () => {
            const imgW = w_px * config.imageScale;
            const imgH = (w_px / imageAspectRatio) * config.imageScale;
            const initialX = (w_px - imgW) / 2;
            const initialY = (h_px - imgH) / 2;

            const renderX = initialX + config.imageX * scale;
            const renderY = initialY + config.imageY * scale;

            if (shapeId === 'custom' && customPathData) {
                // Use offscreen mask canvas for destination-in compositing to handle inset
                const imgCanvas = document.createElement('canvas');
                imgCanvas.width = w_px;
                imgCanvas.height = h_px;
                const iCtx = imgCanvas.getContext('2d');
                iCtx.drawImage(img, renderX, renderY, imgW, imgH);
                
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = w_px;
                maskCanvas.height = h_px;
                const mCtx = maskCanvas.getContext('2d');
                mCtx.translate(w_px/2, h_px/2);
                const pathScale = (actual_shape_w * scale) / customPathData.boundingBox.width;
                mCtx.scale(pathScale, pathScale);
                mCtx.translate(-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2), -(customPathData.boundingBox.minY + customPathData.boundingBox.height/2));
                const p = new Path2D(customPathData.d);
                
                mCtx.fillStyle = '#ffffff';
                mCtx.fill(p);
                
                if (config.borderWidth > 0) {
                    mCtx.globalCompositeOperation = 'destination-out';
                    mCtx.lineWidth = (config.borderWidth * 2 * scale) / pathScale; 
                    mCtx.strokeStyle = '#000000';
                    mCtx.lineJoin = 'round';
                    mCtx.stroke(p);
                }
                
                iCtx.globalCompositeOperation = 'destination-in';
                iCtx.drawImage(maskCanvas, 0, 0);
                
                ctx.drawImage(imgCanvas, 0, 0);
            } else {
                ctx.drawImage(img, renderX, renderY, imgW, imgH);
                ctx.restore();
            }

            // Punch out keyhole void — only if keyhole is enabled
            if (config.showHole) {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                const holeX_px = config.holeX * scale;
                const holeY_px = config.holeY * scale;
                const holeR_px = (config.holeDiameter / 2) * scale;
                ctx.arc(holeX_px, holeY_px, holeR_px, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Download trigger
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${fileName}_${shapeId}_engrave.png`;
            a.click();
        };
        img.src = imageSrc;
    };

    // Renders the mini SVG preview for the interlocking grid
    const renderMiniBatchPreview = (shapeId) => {
        const config = tagConfigs[shapeId];
        let w_mm = config.width;
        let h_mm = shapeId === 'circle' ? w_mm : config.height;
        let actual_shape_w = w_mm;
        if (shapeId === 'custom' && customPathData) {
            actual_shape_w = config.width;
            h_mm = config.width * (customPathData.boundingBox.height / customPathData.boundingBox.width);
        }
        
        const gap_mm = 2;
        let rotate90 = false;
        
        const tagW_H = w_mm + gap_mm + (shapeId === 'custom' ? 4 : 0);
        const tagH_H = h_mm + gap_mm + (shapeId === 'custom' ? 4 : 0);
        let rows_H = Math.floor((boardHeight - (isInterlocked ? interlockSqueeze : 0)) / (tagH_H - (isInterlocked ? interlockSqueeze : 0)));
        let cols_H = Math.floor((boardWidth - (isInterlocked ? interlockShift : 0)) / tagW_H);
        let count_H = (rows_H > 0 && cols_H > 0) ? rows_H * cols_H : 0;
        
        const tagW_V = h_mm + gap_mm + (shapeId === 'custom' ? 4 : 0);
        const tagH_V = w_mm + gap_mm + (shapeId === 'custom' ? 4 : 0);
        let rows_V = Math.floor((boardHeight - (isInterlocked ? interlockSqueeze : 0)) / (tagH_V - (isInterlocked ? interlockSqueeze : 0)));
        let cols_V = Math.floor((boardWidth - (isInterlocked ? interlockShift : 0)) / tagW_V);
        let count_V = (rows_V > 0 && cols_V > 0) ? rows_V * cols_V : 0;
        
        if (count_V > count_H) rotate90 = true;
        
        const previewCols = 3;
        const previewRows = 3;
        const effW = rotate90 ? tagH_H : tagW_H;
        const effH = rotate90 ? tagW_H : tagH_H;

        const vbW = (effW * previewCols) + (isInterlocked ? interlockShift : 0);
        const vbH = (effH * previewRows) - (isInterlocked ? interlockSqueeze * (previewRows - 1) : 0);

        const items = [];
        for (let r=0; r<previewRows; r++) {
            for (let c=0; c<previewCols; c++) {
                const xOffset = c * effW + (isInterlocked && r%2===1 ? interlockShift : 0);
                const yOffset = r * (effH - (isInterlocked ? interlockSqueeze : 0));
                
                let rot = rotate90 ? 90 : 0;
                if (isInterlocked && r%2===1) rot += 180;
                
                // Draw upright paths, transform handles rotation
                const transform = `translate(${xOffset + effW/2}, ${yOffset + effH/2}) rotate(${rot}) translate(${-tagW_H/2}, ${-tagH_H/2})`;
                
                let pathContent;
                if (shapeId === 'custom' && customPathData) {
                    const scale = actual_shape_w / customPathData.boundingBox.width;
                    pathContent = (
                        <path 
                            d={customPathData.d}
                            transform={`
                                translate(${tagW_H/2}, ${tagH_H/2})
                                scale(${scale}) 
                                translate(${-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2)}, ${-(customPathData.boundingBox.minY + customPathData.boundingBox.height/2)})
                            `}
                            fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="1.5 1.5"
                        />
                    );
                } else {
                    pathContent = <rect x={2} y={2} width={tagW_H-4} height={tagH_H-4} rx={config.borderRadius} fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="1.5 1.5" />;
                }
                
                items.push(
                    <g key={`${r}-${c}`}>
                        <rect x={xOffset} y={yOffset} width={effW} height={effH} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                        <g transform={transform}>
                            {pathContent}
                        </g>
                    </g>
                );
            }
        }

        return (
            <svg width="100%" height="100%" viewBox={`0 0 ${vbW} ${vbH}`} style={{ overflow: 'visible' }}>
                {items}
            </svg>
        );
    };

    // Download Batch Board Engrave and Cut
    const handleDownloadBatch = async (shapeId) => {
        setIsGeneratingBatch(true);
        // Give UI time to show loading state
        await new Promise(r => setTimeout(r, 50));
        
        try {
            const config = tagConfigs[shapeId];
            let w_mm = config.width;
            let h_mm = shapeId === 'circle' ? w_mm : config.height;
            let pad_mm = 0;
            let actual_shape_w = w_mm;

            if (shapeId === 'custom' && customPathData) {
                pad_mm = 2; // 2mm padding on all sides for the bounding box
                actual_shape_w = config.width;
                const actual_shape_h = config.width * (customPathData.boundingBox.height / customPathData.boundingBox.width);
                w_mm = actual_shape_w + (pad_mm * 2);
                h_mm = actual_shape_h + (pad_mm * 2);
            }

            const radius_mm = shapeId === 'square' ? Math.min(config.borderRadius, Math.min(w_mm, h_mm) / 2) : 0;
            const gap_mm = 2; // Fixed 2mm gap between items

            // Compute optimal pack (0 vs 90 deg rotation)
            const tagW_H = w_mm + gap_mm;
            const tagH_H = h_mm + gap_mm;
            let rows_H = Math.floor((boardHeight - (isInterlocked ? interlockSqueeze : 0)) / (tagH_H - (isInterlocked ? interlockSqueeze : 0)));
            let cols_H = Math.floor((boardWidth - (isInterlocked ? interlockShift : 0)) / tagW_H);
            let count_H = (rows_H > 0 && cols_H > 0) ? rows_H * cols_H : 0;

            const tagW_V = h_mm + gap_mm;
            const tagH_V = w_mm + gap_mm;
            let rows_V = Math.floor((boardHeight - (isInterlocked ? interlockSqueeze : 0)) / (tagH_V - (isInterlocked ? interlockSqueeze : 0)));
            let cols_V = Math.floor((boardWidth - (isInterlocked ? interlockShift : 0)) / tagW_V);
            let count_V = (rows_V > 0 && cols_V > 0) ? rows_V * cols_V : 0;

            const rotate90 = count_V > count_H;
            const cols = rotate90 ? cols_V : cols_H;
            const rows = rotate90 ? rows_V : rows_H;
            const totalCount = rotate90 ? count_V : count_H;
            
            if (totalCount === 0) {
                alert("Board is too small to fit even one tag.");
                setIsGeneratingBatch(false);
                return;
            }

            // Canvas scale (15px per mm)
            const scale = 15;
            const cw_px = boardWidth * scale;
            const ch_px = boardHeight * scale;
            const t_w_px = w_mm * scale;
            const t_h_px = h_mm * scale;
            const r_px = radius_mm * scale;

            // Main Canvases
            const cutCanvas = document.createElement('canvas');
            cutCanvas.width = cw_px;
            cutCanvas.height = ch_px;
            const cutCtx = cutCanvas.getContext('2d');
            cutCtx.clearRect(0, 0, cw_px, ch_px);

            const engCanvas = document.createElement('canvas');
            engCanvas.width = cw_px;
            engCanvas.height = ch_px;
            const engCtx = engCanvas.getContext('2d');
            engCtx.clearRect(0, 0, cw_px, ch_px);

            // Single Engrave
            const singleEngCanvas = document.createElement('canvas');
            singleEngCanvas.width = t_w_px;
            singleEngCanvas.height = t_h_px;
            const sEngCtx = singleEngCanvas.getContext('2d');
            
            if (shapeId === 'custom' && customPathData) {
                sEngCtx.save();
                sEngCtx.translate(t_w_px/2, t_h_px/2);
                const pathScale = (actual_shape_w * scale) / customPathData.boundingBox.width;
                sEngCtx.scale(pathScale, pathScale);
                sEngCtx.translate(-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2), -(customPathData.boundingBox.minY + customPathData.boundingBox.height/2));
                const p = new Path2D(customPathData.d);
                sEngCtx.fillStyle = '#ffffff';
                sEngCtx.fill(p);
                sEngCtx.restore();
            } else {
                sEngCtx.save();
                drawShapePath(sEngCtx, shapeId, t_w_px, t_h_px, r_px, 0);
                sEngCtx.fillStyle = '#ffffff';
                sEngCtx.fill();
                sEngCtx.restore();
            }

            if (shapeId !== 'custom') {
                sEngCtx.save();
                const border_px = config.borderWidth * scale;
                drawShapePath(sEngCtx, shapeId, t_w_px, t_h_px, r_px, border_px);
                sEngCtx.clip();
            }

            const img = new Image();
            await new Promise((resolve) => {
                img.onload = resolve;
                img.src = imageSrc;
            });

            const imgW = t_w_px * config.imageScale;
            const imgH = (t_w_px / imageAspectRatio) * config.imageScale;
            const initialX = (t_w_px - imgW) / 2;
            const initialY = (t_h_px - imgH) / 2;
            const renderX = initialX + config.imageX * scale;
            const renderY = initialY + config.imageY * scale;

            if (shapeId === 'custom' && customPathData) {
                const imgTempCanvas = document.createElement('canvas');
                imgTempCanvas.width = t_w_px;
                imgTempCanvas.height = t_h_px;
                const iCtx = imgTempCanvas.getContext('2d');
                iCtx.drawImage(img, renderX, renderY, imgW, imgH);
                
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = t_w_px;
                maskCanvas.height = t_h_px;
                const mCtx = maskCanvas.getContext('2d');
                mCtx.translate(t_w_px/2, t_h_px/2);
                const pathScale = (actual_shape_w * scale) / customPathData.boundingBox.width;
                mCtx.scale(pathScale, pathScale);
                mCtx.translate(-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2), -(customPathData.boundingBox.minY + customPathData.boundingBox.height/2));
                const p = new Path2D(customPathData.d);
                
                mCtx.fillStyle = '#ffffff';
                mCtx.fill(p);
                
                if (config.borderWidth > 0) {
                    mCtx.globalCompositeOperation = 'destination-out';
                    mCtx.lineWidth = (config.borderWidth * 2 * scale) / pathScale; 
                    mCtx.strokeStyle = '#000000';
                    mCtx.lineJoin = 'round';
                    mCtx.stroke(p);
                }
                
                iCtx.globalCompositeOperation = 'destination-in';
                iCtx.drawImage(maskCanvas, 0, 0);
                sEngCtx.drawImage(imgTempCanvas, 0, 0);
            } else {
                sEngCtx.drawImage(img, renderX, renderY, imgW, imgH);
                sEngCtx.restore();
            }

            if (config.showHole) {
                sEngCtx.save();
                sEngCtx.globalCompositeOperation = 'destination-out';
                sEngCtx.beginPath();
                const holeX_px = config.holeX * scale;
                const holeY_px = config.holeY * scale;
                const holeR_px = (config.holeDiameter / 2) * scale;
                sEngCtx.arc(holeX_px, holeY_px, holeR_px, 0, Math.PI * 2);
                sEngCtx.fill();
                sEngCtx.restore();
            }

            // Single Cut
            const singleCutCanvas = document.createElement('canvas');
            singleCutCanvas.width = t_w_px;
            singleCutCanvas.height = t_h_px;
            const sCutCtx = singleCutCanvas.getContext('2d');
            sCutCtx.clearRect(0, 0, t_w_px, t_h_px);

            if (shapeId === 'custom' && customPathData) {
                sCutCtx.save();
                sCutCtx.translate(t_w_px/2, t_h_px/2);
                const pathScale = (actual_shape_w * scale) / customPathData.boundingBox.width;
                sCutCtx.scale(pathScale, pathScale);
                sCutCtx.translate(-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2), -(customPathData.boundingBox.minY + customPathData.boundingBox.height/2));
                const p = new Path2D(customPathData.d);
                sCutCtx.lineWidth = 3 / pathScale;
                sCutCtx.strokeStyle = '#000000';
                sCutCtx.stroke(p);
                sCutCtx.restore();
            } else {
                sCutCtx.save();
                drawShapePath(sCutCtx, shapeId, t_w_px, t_h_px, r_px, 0);
                sCutCtx.strokeStyle = '#000000';
                sCutCtx.lineWidth = 3;
                sCutCtx.stroke();
                sCutCtx.restore();
            }

            if (config.showHole) {
                sCutCtx.save();
                sCutCtx.beginPath();
                const holeX_px = config.holeX * scale;
                const holeY_px = config.holeY * scale;
                const holeR_px = (config.holeDiameter / 2) * scale;
                sCutCtx.arc(holeX_px, holeY_px, holeR_px, 0, Math.PI * 2);
                sCutCtx.strokeStyle = '#000000';
                sCutCtx.lineWidth = 3;
                sCutCtx.stroke();
                sCutCtx.restore();
            }

            // Loop and draw to main canvases
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const effW = (rotate90 ? t_h_px : t_w_px);
                    const effH = (rotate90 ? t_w_px : t_h_px);
                    const effGap = gap_mm * scale;

                    const xOffset = c * (effW + effGap) + (isInterlocked && r%2===1 ? interlockShift * scale : 0) + (effGap / 2);
                    const yOffset = r * (effH + effGap - (isInterlocked ? interlockSqueeze * scale : 0)) + (effGap / 2);

                    cutCtx.save();
                    engCtx.save();

                    cutCtx.translate(xOffset, yOffset);
                    engCtx.translate(xOffset, yOffset);

                    let rot = rotate90 ? 90 : 0;
                    if (isInterlocked && r%2===1) rot += 180;

                    if (rot !== 0) {
                        cutCtx.translate(effW / 2, effH / 2);
                        cutCtx.rotate((rot * Math.PI) / 180);
                        cutCtx.translate(-t_w_px / 2, -t_h_px / 2);
                        
                        engCtx.translate(effW / 2, effH / 2);
                        engCtx.rotate((rot * Math.PI) / 180);
                        engCtx.translate(-t_w_px / 2, -t_h_px / 2);
                    }

                    cutCtx.drawImage(singleCutCanvas, 0, 0);
                    engCtx.drawImage(singleEngCanvas, 0, 0);

                    cutCtx.restore();
                    engCtx.restore();
                }
            }

            // Trigger downloads sequentially
            const aCut = document.createElement('a');
            aCut.href = cutCanvas.toDataURL('image/png');
            aCut.download = `${fileName}_batch_${shapeId}_cut.png`;
            aCut.click();

            await new Promise(r => setTimeout(r, 500));

            const aEng = document.createElement('a');
            aEng.href = engCanvas.toDataURL('image/png');
            aEng.download = `${fileName}_batch_${shapeId}_engrave.png`;
            aEng.click();

        } catch (error) {
            console.error("Error generating batch:", error);
            alert("Failed to generate batch. Board might be too large for browser memory.");
        } finally {
            setIsGeneratingBatch(false);
        }
    };

    // Renders the specific SVG elements for a tag configuration
    const renderTagSvgContent = (shapeId) => {
        const config = tagConfigs[shapeId];
        let w = config.width;
        let h = shapeId === 'circle' ? w : config.height;
        let pad = 0;
        let actual_shape_w = w;

        if (shapeId === 'custom' && customPathData) {
            pad = 2; // 2mm padding on all sides for the bounding box
            actual_shape_w = config.width;
            const actual_shape_h = config.width * (customPathData.boundingBox.height / customPathData.boundingBox.width);
            w = actual_shape_w + (pad * 2);
            h = actual_shape_h + (pad * 2);
        }

        const radius = shapeId === 'square' ? Math.min(config.borderRadius, Math.min(w, h) / 2) : 0;

        const imgW = w * config.imageScale;
        const imgH = (w / imageAspectRatio) * config.imageScale;
        const initialX = (w - imgW) / 2;
        const initialY = (h - imgH) / 2;

        const renderX = initialX + config.imageX;
        const renderY = initialY + config.imageY;

        const clipId = `clip-${shapeId}-preview`;
        const maskInnerId = `mask-inner-${shapeId}`;

        const isActivelyDraggingImage = dragState?.type === 'image' && dragState?.shapeId === shapeId;

        return (
            <svg 
                ref={svgRefs[shapeId]}
                width="100%" 
                height="100%" 
                viewBox={`0 0 ${w} ${h}`}
                style={{ overflow: 'visible', pointerEvents: 'auto' }}
            >
                <defs>
                    <clipPath id={clipId}>
                        {shapeId === 'square' && (
                            <rect 
                                x={config.borderWidth} 
                                y={config.borderWidth} 
                                width={Math.max(0, w - 2 * config.borderWidth)} 
                                height={Math.max(0, h - 2 * config.borderWidth)} 
                                rx={Math.max(0, radius - config.borderWidth)} 
                                ry={Math.max(0, radius - config.borderWidth)} 
                            />
                        )}
                        {shapeId === 'heart' && <path d={getHeartPath(w, h, config.borderWidth)} />}
                        {shapeId === 'circle' && (
                            <circle 
                                cx={w/2} 
                                cy={w/2} 
                                r={Math.max(0, w/2 - config.borderWidth)} 
                            />
                        )}
                    </clipPath>

                    {shapeId === 'custom' && customPathData && (
                        <mask id={maskInnerId}>
                            <rect width="100%" height="100%" fill="black" />
                            <path 
                                d={customPathData.d}
                                transform={`translate(${w/2}, ${h/2}) scale(${actual_shape_w / customPathData.boundingBox.width}) translate(${-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2)}, ${-(customPathData.boundingBox.minY + customPathData.boundingBox.height/2)})`}
                                fill="white" 
                            />
                            {config.borderWidth > 0 && (
                                <path 
                                    d={customPathData.d}
                                    transform={`translate(${w/2}, ${h/2}) scale(${actual_shape_w / customPathData.boundingBox.width}) translate(${-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2)}, ${-(customPathData.boundingBox.minY + customPathData.boundingBox.height/2)})`}
                                    fill="none" 
                                    stroke="black" 
                                    strokeWidth={config.borderWidth * 2 / (actual_shape_w / customPathData.boundingBox.width)} 
                                    strokeLinejoin="round" 
                                />
                            )}
                        </mask>
                    )}
                </defs>

                {/* Full Shape White Base (Custom Only) */}
                {shapeId === 'custom' && customPathData && (
                    <path 
                        d={customPathData.d}
                        transform={`translate(${w/2}, ${h/2}) scale(${actual_shape_w / customPathData.boundingBox.width}) translate(${-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2)}, ${-(customPathData.boundingBox.minY + customPathData.boundingBox.height/2)})`}
                        fill="#ffffff" 
                    />
                )}

                {/* Border Margin Preview Overlay (Custom Only) */}
                {shapeId === 'custom' && customPathData && config.borderWidth > 0 && (
                    <path 
                        d={customPathData.d}
                        transform={`translate(${w/2}, ${h/2}) scale(${actual_shape_w / customPathData.boundingBox.width}) translate(${-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2)}, ${-(customPathData.boundingBox.minY + customPathData.boundingBox.height/2)})`}
                        fill="#3b82f6" opacity="0.3"
                    />
                )}

                {/* Live rendering container with shape clipping */}
                <g clipPath={shapeId !== 'custom' ? `url(#${clipId})` : undefined} mask={shapeId === 'custom' ? `url(#${maskInnerId})` : undefined}>
                    {/* Solid white background behind the image */}
                    {shapeId === 'square' && <rect x="0" y="0" width={w} height={h} rx={radius} ry={radius} fill="#ffffff" stroke="none" />}
                    {shapeId === 'heart' && <path d={getHeartPath(w, h, 0)} fill="#ffffff" stroke="none" />}
                    {shapeId === 'circle' && <circle cx={w/2} cy={w/2} r={w/2} fill="#ffffff" stroke="none" />}
                    {shapeId === 'custom' && <rect x="-100" y="-100" width={w + 200} height={h + 200} fill="#ffffff" stroke="none" />}

                    {/* Draggable user image */}
                    {imageSrc && (
                        <image
                            href={imageSrc}
                            x={renderX}
                            y={renderY}
                            width={imgW}
                            height={imgH}
                            onMouseDown={(e) => handleImageMouseDown(e, shapeId)}
                            style={{ 
                                cursor: isActivelyDraggingImage ? 'grabbing' : 'grab',
                                userSelect: 'none'
                            }}
                        />
                    )}
                </g>

                {/* Border Margin Preview Guide Line (Solid Blue Line for Standard Shapes) */}
                {config.borderWidth > 0 && shapeId !== 'custom' && (
                    <g opacity="0.85" style={{ pointerEvents: 'none' }}>
                        {shapeId === 'square' && (
                            <rect 
                                x={config.borderWidth} 
                                y={config.borderWidth} 
                                width={Math.max(0, w - 2 * config.borderWidth)} 
                                height={Math.max(0, h - 2 * config.borderWidth)} 
                                rx={Math.max(0, radius - config.borderWidth)} 
                                ry={Math.max(0, radius - config.borderWidth)} 
                                fill="none" 
                                stroke="#3b82f6" 
                                strokeWidth="0.6" 
                            />
                        )}
                        {shapeId === 'heart' && <path d={getHeartPath(w, h, config.borderWidth)} fill="none" stroke="#3b82f6" strokeWidth="0.6" />}
                        {shapeId === 'circle' && <circle cx={w/2} cy={w/2} r={Math.max(0, w/2 - config.borderWidth)} fill="none" stroke="#3b82f6" strokeWidth="0.6" />}
                    </g>
                )}

                {/* Dotted Red Cut Out Line (CNC Guide Representation) */}
                {shapeId === 'square' && <rect x="0" y="0" width={w} height={h} rx={radius} ry={radius} fill="none" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="1.5 1" opacity="0.8" style={{ pointerEvents: 'none' }} />}
                {shapeId === 'heart' && <path d={getHeartPath(w, h, 0)} fill="none" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="1.5 1" opacity="0.8" style={{ pointerEvents: 'none' }} />}
                {shapeId === 'circle' && <circle cx={w/2} cy={w/2} r={w/2} fill="none" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="1.5 1" opacity="0.8" style={{ pointerEvents: 'none' }} />}
                {shapeId === 'custom' && customPathData && (
                    <path 
                        d={customPathData.d}
                        transform={`
                            translate(${w/2}, ${h/2}) 
                            scale(${actual_shape_w / customPathData.boundingBox.width}) 
                            translate(${-(customPathData.boundingBox.minX + customPathData.boundingBox.width/2)}, ${-(customPathData.boundingBox.minY + customPathData.boundingBox.height/2)})
                        `}
                        fill="none" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="1.5 1" opacity="0.8" style={{ pointerEvents: 'none' }}
                    />
                )}

                {/* Keyhole indicator (shows dark void) — only when enabled */}
                {config.showHole && (
                    <>
                        <circle 
                            cx={config.holeX} 
                            cy={config.holeY} 
                            r={config.holeDiameter / 2} 
                            fill="#050505" 
                            stroke="#ef4444" 
                            strokeWidth="0.6" 
                            style={{ pointerEvents: 'none' }}
                        />

                        {/* Glimmer / Interaction highlight overlay ring for keyhole */}
                        <circle 
                            cx={config.holeX} 
                            cy={config.holeY} 
                            r={config.holeDiameter / 2 + 0.8} 
                            fill="none" 
                            stroke="#8b5cf6" 
                            strokeWidth="0.4" 
                            opacity="0.75"
                            style={{ pointerEvents: 'none' }}
                        />

                        {/* Interactive enlarged mouse collision circle for easy dragging */}
                        <circle 
                            cx={config.holeX} 
                            cy={config.holeY} 
                            r={Math.max(6, config.holeDiameter / 2 + 2.5)} 
                            fill="transparent" 
                            style={{ cursor: 'move' }}
                            onMouseDown={(e) => handleHoleMouseDown(e, shapeId)}
                        />
                    </>
                )}
            </svg>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%' }}>
            
            {/* Header & Global Upload Area */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '24px',
                padding: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '24px',
                flexWrap: 'wrap'
            }}>
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '900', fontStyle: 'italic', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        CNC KEYTAG STUDIO
                    </h2>
                    <p style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '4px' }}>
                        Calibrate, Position Artwork, Place Keyhole, and Download Outlines
                    </p>
                </div>

                {/* Upload Component */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: '1px dashed rgba(99, 102, 241, 0.4)',
                            backgroundColor: 'rgba(99, 102, 241, 0.04)',
                            borderRadius: '16px',
                            padding: '12px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#6366f1';
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.04)';
                        }}
                    >
                        <Upload size={18} style={{ color: '#6366f1' }} />
                        <div>
                            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>Upload Artwork Image</p>
                            <p style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                                {fileName ? `${fileName.substring(0, 16)}${fileName.length > 16 ? '...' : ''}` : 'Drag & drop or browse'}
                            </p>
                        </div>
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept="image/*" 
                        onChange={handleFileChange} 
                    />
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <button 
                    onClick={() => setActiveTab('standard')}
                    style={{
                        padding: '10px 24px',
                        borderRadius: '12px',
                        background: activeTab === 'standard' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: activeTab === 'standard' ? '#818cf8' : '#888',
                        border: `1px solid ${activeTab === 'standard' ? 'rgba(99, 102, 241, 0.3)' : 'transparent'}`,
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                    }}
                >
                    Standard Shapes
                </button>
                <button 
                    onClick={() => setActiveTab('custom')}
                    style={{
                        padding: '10px 24px',
                        borderRadius: '12px',
                        background: activeTab === 'custom' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: activeTab === 'custom' ? '#818cf8' : '#888',
                        border: `1px solid ${activeTab === 'custom' ? 'rgba(99, 102, 241, 0.3)' : 'transparent'}`,
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                    }}
                >
                    Custom Shape
                </button>
                <button 
                    onClick={() => setActiveTab('artwork-prep')}
                    style={{
                        padding: '10px 24px',
                        borderRadius: '12px',
                        background: activeTab === 'artwork-prep' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: activeTab === 'artwork-prep' ? '#818cf8' : '#888',
                        border: `1px solid ${activeTab === 'artwork-prep' ? 'rgba(99, 102, 241, 0.3)' : 'transparent'}`,
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                    }}
                >
                    Artwork Prep (Auto-Extract)
                </button>
                <button 
                    onClick={() => setActiveTab('layered')}
                    style={{
                        padding: '10px 24px',
                        borderRadius: '12px',
                        background: activeTab === 'layered' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: activeTab === 'layered' ? '#818cf8' : '#888',
                        border: `1px solid ${activeTab === 'layered' ? 'rgba(99, 102, 241, 0.3)' : 'transparent'}`,
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                    }}
                >
                    Layered Keytags
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'artwork-prep' && (
                <div style={{ width: '100%' }}>
                    <ArtworkPrepModule />
                </div>
            )}

            {activeTab === 'layered' && (
                <div style={{ width: '100%' }}>
                    <LayeredKeytagsModule />
                </div>
            )}

            {activeTab === 'standard' && (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '24px',
                width: '100%'
            }}>
                {['square', 'heart', 'circle'].map(shapeId => {
                    const config = tagConfigs[shapeId];
                    const w = config.width;
                    const h = shapeId === 'circle' ? w : config.height;
                    const titleText = `${shapeId.toUpperCase()} FRAME`;

                    return (
                        <div 
                            key={shapeId}
                            style={{
                                background: 'rgba(255,255,255,0.015)',
                                border: '1px solid rgba(255,255,255,0.04)',
                                borderRadius: '24px',
                                padding: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '20px',
                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                            }}
                        >
                            {/* Shape Card Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {shapeId === 'square' && <SquareIcon size={14} style={{ color: '#8b5cf6' }} />}
                                    {shapeId === 'heart' && <Heart size={14} style={{ color: '#8b5cf6' }} />}
                                    {shapeId === 'circle' && <CircleIcon size={14} style={{ color: '#8b5cf6' }} />}
                                    <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.05em' }}>{titleText}</h3>
                                </div>
                                <button 
                                    onClick={() => handleReset(shapeId)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#6366f1',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '10px',
                                        fontWeight: '600'
                                    }}
                                >
                                    <RefreshCw size={10} /> Reset
                                </button>
                            </div>

                            {/* Canvas Preview Box */}
                            <div style={{
                                width: '100%',
                                height: '240px',
                                background: '#070707',
                                backgroundImage: `url('${transparentPattern}')`,
                                borderRadius: '16px',
                                border: '1px solid rgba(255,255,255,0.02)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                position: 'relative'
                            }}>
                                <div style={{
                                    width: '180px',
                                    height: '180px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative'
                                }}>
                                    {renderTagSvgContent(shapeId)}
                                </div>

                                {/* Drag Hint Overlay */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: '10px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    backgroundColor: 'rgba(5, 5, 5, 0.75)',
                                    borderRadius: '8px',
                                    padding: '4px 10px',
                                    fontSize: '9px',
                                    color: '#888',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    pointerEvents: 'none',
                                    whiteSpace: 'nowrap'
                                }}>
                                    <Move size={10} /> {config.showHole ? 'Drag image or keyhole to position' : 'Drag image to position'}
                                </div>
                            </div>

                            {/* Configuration Settings Panel */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: '1' }}>
                                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                                    <p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#8b5cf6', fontWeight: 'bold', letterSpacing: '0.05em' }}>Calibration Settings</p>
                                </div>

                                {/* Dimension Controls */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    
                                    {/* Width Setting */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                            <span>{shapeId === 'circle' ? 'Diameter' : 'Tag Width'}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <input
                                                    type="number"
                                                    min={30}
                                                    max={1000}
                                                    value={w}
                                                    onChange={(e) => {
                                                        const raw = parseInt(e.target.value);
                                                        if (isNaN(raw)) return;
                                                        setTagConfigs(prev => {
                                                            const updated = { ...prev[shapeId], width: raw };
                                                            if (shapeId === 'circle') updated.height = raw;
                                                            const r = updated.holeDiameter / 2;
                                                            updated.holeX = Math.min(raw - r - 1.5, Math.max(r + 1.5, updated.holeX));
                                                            return { ...prev, [shapeId]: updated };
                                                        });
                                                    }}
                                                    onBlur={(e) => {
                                                        const val = Math.max(30, Math.min(1000, parseInt(e.target.value) || 30));
                                                        setTagConfigs(prev => {
                                                            const updated = { ...prev[shapeId], width: val };
                                                            if (shapeId === 'circle') updated.height = val;
                                                            const r = updated.holeDiameter / 2;
                                                            updated.holeX = Math.min(val - r - 1.5, Math.max(r + 1.5, updated.holeX));
                                                            return { ...prev, [shapeId]: updated };
                                                        });
                                                    }}
                                                    style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                />
                                                <span style={{ color: '#888', fontSize: '10px' }}>mm</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="30" 
                                            max="1000" 
                                            value={w} 
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                setTagConfigs(prev => {
                                                    const updated = { ...prev[shapeId], width: val };
                                                    if (shapeId === 'circle') updated.height = val;
                                                    // Ensure hole stays bounded
                                                    const r = updated.holeDiameter / 2;
                                                    updated.holeX = Math.min(val - r - 1.5, Math.max(r + 1.5, updated.holeX));
                                                    return { ...prev, [shapeId]: updated };
                                                });
                                            }}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>

                                    {/* Height Setting (Square & Heart only) */}
                                    {shapeId !== 'circle' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                                <span>Tag Height</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <input
                                                        type="number"
                                                        min={30}
                                                        max={1000}
                                                        value={h}
                                                        onChange={(e) => {
                                                            const raw = parseInt(e.target.value);
                                                            if (isNaN(raw)) return;
                                                            setTagConfigs(prev => {
                                                                const updated = { ...prev[shapeId], height: raw };
                                                                const r = updated.holeDiameter / 2;
                                                                updated.holeY = Math.min(raw - r - 1.5, Math.max(r + 1.5, updated.holeY));
                                                                return { ...prev, [shapeId]: updated };
                                                            });
                                                        }}
                                                        onBlur={(e) => {
                                                            const val = Math.max(30, Math.min(1000, parseInt(e.target.value) || 30));
                                                            setTagConfigs(prev => {
                                                                const updated = { ...prev[shapeId], height: val };
                                                                const r = updated.holeDiameter / 2;
                                                                updated.holeY = Math.min(val - r - 1.5, Math.max(r + 1.5, updated.holeY));
                                                                return { ...prev, [shapeId]: updated };
                                                            });
                                                        }}
                                                        style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                    />
                                                    <span style={{ color: '#888', fontSize: '10px' }}>mm</span>
                                                </div>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="30" 
                                                max="1000" 
                                                value={h} 
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setTagConfigs(prev => {
                                                        const updated = { ...prev[shapeId], height: val };
                                                        const r = updated.holeDiameter / 2;
                                                        updated.holeY = Math.min(val - r - 1.5, Math.max(r + 1.5, updated.holeY));
                                                        return { ...prev, [shapeId]: updated };
                                                    });
                                                }}
                                                style={{ width: '100%', cursor: 'pointer' }}
                                            />
                                        </div>
                                    )}

                                    {/* Corner Radius (Square tag only) */}
                                    {shapeId === 'square' && (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                                <span>Corner Radius</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={20}
                                                        value={config.borderRadius}
                                                        onChange={(e) => {
                                                            const raw = parseInt(e.target.value);
                                                            if (isNaN(raw)) return;
                                                            setTagConfigs(prev => ({ ...prev, square: { ...prev.square, borderRadius: raw } }));
                                                        }}
                                                        onBlur={(e) => {
                                                            const val = Math.max(0, Math.min(20, parseInt(e.target.value) || 0));
                                                            setTagConfigs(prev => ({ ...prev, square: { ...prev.square, borderRadius: val } }));
                                                        }}
                                                        style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                    />
                                                    <span style={{ color: '#888', fontSize: '10px' }}>mm</span>
                                                </div>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="0" 
                                                max="20" 
                                                value={config.borderRadius} 
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setTagConfigs(prev => ({
                                                        ...prev,
                                                        square: { ...prev.square, borderRadius: val }
                                                    }));
                                                }}
                                                style={{ width: '100%', cursor: 'pointer' }}
                                            />
                                        </div>
                                    )}

                                    {/* Border Margin (Artwork Inset) */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                            <span>Border Margin</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={12}
                                                    step={0.5}
                                                    value={config.borderWidth}
                                                    onChange={(e) => {
                                                        const raw = parseFloat(e.target.value);
                                                        if (isNaN(raw)) return;
                                                        setTagConfigs(prev => ({ ...prev, [shapeId]: { ...prev[shapeId], borderWidth: raw } }));
                                                    }}
                                                    onBlur={(e) => {
                                                        const val = Math.max(0, Math.min(12, parseFloat(e.target.value) || 0));
                                                        setTagConfigs(prev => ({ ...prev, [shapeId]: { ...prev[shapeId], borderWidth: val } }));
                                                    }}
                                                    style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                />
                                                <span style={{ color: '#888', fontSize: '10px' }}>mm</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="12" 
                                            step="0.5"
                                            value={config.borderWidth} 
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                setTagConfigs(prev => ({
                                                    ...prev,
                                                    [shapeId]: { ...prev[shapeId], borderWidth: val }
                                                }));
                                            }}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>

                                    {/* Keyhole Toggle */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '11px', color: '#bbb' }}>Keyhole</span>
                                        <button
                                            onClick={() => {
                                                setTagConfigs(prev => ({
                                                    ...prev,
                                                    [shapeId]: { ...prev[shapeId], showHole: !prev[shapeId].showHole }
                                                }));
                                            }}
                                            style={{
                                                width: '40px',
                                                height: '22px',
                                                borderRadius: '11px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                position: 'relative',
                                                background: config.showHole
                                                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                                    : 'rgba(255,255,255,0.1)',
                                                transition: 'background 0.25s ease',
                                                padding: 0,
                                            }}
                                        >
                                            <div style={{
                                                width: '16px',
                                                height: '16px',
                                                borderRadius: '50%',
                                                background: '#fff',
                                                position: 'absolute',
                                                top: '3px',
                                                left: config.showHole ? '21px' : '3px',
                                                transition: 'left 0.25s ease',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                            }} />
                                        </button>
                                    </div>

                                    {/* Keyhole Diameter — only shown when keyhole is enabled */}
                                    {config.showHole && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                            <span>Keyhole Diameter</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <input
                                                    type="number"
                                                    min={3}
                                                    max={10}
                                                    step={0.5}
                                                    value={config.holeDiameter}
                                                    onChange={(e) => {
                                                        const raw = parseFloat(e.target.value);
                                                        if (isNaN(raw)) return;
                                                        setTagConfigs(prev => {
                                                            const updated = { ...prev[shapeId], holeDiameter: raw };
                                                            const r = raw / 2;
                                                            updated.holeX = Math.min(updated.width - r - 1.5, Math.max(r + 1.5, updated.holeX));
                                                            const updatedH = shapeId === 'circle' ? updated.width : updated.height;
                                                            updated.holeY = Math.min(updatedH - r - 1.5, Math.max(r + 1.5, updated.holeY));
                                                            return { ...prev, [shapeId]: updated };
                                                        });
                                                    }}
                                                    onBlur={(e) => {
                                                        const val = Math.max(3, Math.min(10, parseFloat(e.target.value) || 3));
                                                        setTagConfigs(prev => {
                                                            const updated = { ...prev[shapeId], holeDiameter: val };
                                                            const r = val / 2;
                                                            updated.holeX = Math.min(updated.width - r - 1.5, Math.max(r + 1.5, updated.holeX));
                                                            const updatedH = shapeId === 'circle' ? updated.width : updated.height;
                                                            updated.holeY = Math.min(updatedH - r - 1.5, Math.max(r + 1.5, updated.holeY));
                                                            return { ...prev, [shapeId]: updated };
                                                        });
                                                    }}
                                                    style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                />
                                                <span style={{ color: '#888', fontSize: '10px' }}>mm</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="3" 
                                            max="10" 
                                            step="0.5"
                                            value={config.holeDiameter} 
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                setTagConfigs(prev => {
                                                    const updated = { ...prev[shapeId], holeDiameter: val };
                                                    const r = val / 2;
                                                    // Re-constrain position immediately
                                                    updated.holeX = Math.min(updated.width - r - 1.5, Math.max(r + 1.5, updated.holeX));
                                                    const updatedH = shapeId === 'circle' ? updated.width : updated.height;
                                                    updated.holeY = Math.min(updatedH - r - 1.5, Math.max(r + 1.5, updated.holeY));
                                                    return { ...prev, [shapeId]: updated };
                                                });
                                            }}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>
                                    )}

                                    {/* Image Zoom scale */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                            <span>Image Scale</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <input
                                                    type="number"
                                                    min={20}
                                                    max={300}
                                                    value={Math.round(config.imageScale * 100)}
                                                    onChange={(e) => {
                                                        const raw = parseInt(e.target.value);
                                                        if (isNaN(raw)) return;
                                                        setTagConfigs(prev => ({
                                                            ...prev,
                                                            [shapeId]: { ...prev[shapeId], imageScale: raw / 100 }
                                                        }));
                                                    }}
                                                    onBlur={(e) => {
                                                        const pct = Math.max(20, Math.min(300, parseInt(e.target.value) || 100));
                                                        setTagConfigs(prev => ({
                                                            ...prev,
                                                            [shapeId]: { ...prev[shapeId], imageScale: pct / 100 }
                                                        }));
                                                    }}
                                                    style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                />
                                                <span style={{ color: '#888', fontSize: '10px' }}>%</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0.2" 
                                            max="3.0" 
                                            step="0.05"
                                            value={config.imageScale} 
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value);
                                                setTagConfigs(prev => ({
                                                    ...prev,
                                                    [shapeId]: { ...prev[shapeId], imageScale: val }
                                                }));
                                            }}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Dual Download Buttons */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: 'auto' }}>
                                <button
                                    onClick={() => handleDownloadCut(shapeId)}
                                    style={{
                                        padding: '12px',
                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                        borderRadius: '12px',
                                        color: '#ef4444',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                    }}
                                >
                                    <Download size={12} /> Cut Image
                                </button>
                                
                                <button
                                    onClick={() => handleDownloadEngrave(shapeId)}
                                    style={{
                                        padding: '12px',
                                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                        border: '1px solid rgba(99, 102, 241, 0.2)',
                                        borderRadius: '12px',
                                        color: '#818cf8',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
                                    }}
                                >
                                    <Download size={12} /> Engrave Image
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            )}
            
            {activeTab === 'custom' && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '24px',
                    width: '100%',
                    maxWidth: '800px',
                    margin: '0 auto'
                }}>
                    {!customPathData ? (
                        <div style={{
                            background: 'rgba(255,255,255,0.015)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '24px',
                            padding: '32px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: '400px',
                            gap: '20px',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                            textAlign: 'center'
                        }}>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '50%',
                                background: 'rgba(99, 102, 241, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '10px'
                            }}>
                                <Play size={28} style={{ color: '#818cf8', marginLeft: '4px' }} />
                            </div>
                            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', margin: 0 }}>Custom Outline Tracer</h3>
                            <p style={{ fontSize: '13px', color: '#888', maxWidth: '400px', lineHeight: '1.6' }}>
                                Upload a secondary image that defines the SHAPE of the key tag, while keeping your main artwork inside it. Perfect for custom contours.
                            </p>
                            
                            {/* Shape Upload Component */}
                            <div 
                                onClick={() => shapeFileInputRef.current?.click()}
                                style={{
                                    border: '1px dashed rgba(99, 102, 241, 0.4)',
                                    backgroundColor: 'rgba(99, 102, 241, 0.04)',
                                    borderRadius: '16px',
                                    padding: '16px 32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    marginTop: '10px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#6366f1';
                                    e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                                    e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.04)';
                                }}
                            >
                                <Upload size={18} style={{ color: '#6366f1' }} />
                                <div style={{ textAlign: 'left' }}>
                                    <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>Upload Shape Outline Image</p>
                                    <p style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                                        {shapeFileName ? `${shapeFileName.substring(0, 20)}${shapeFileName.length > 20 ? '...' : ''}` : 'e.g. silhouette or line-art'}
                                    </p>
                                </div>
                            </div>
                            <input 
                                type="file" 
                                ref={shapeFileInputRef} 
                                style={{ display: 'none' }} 
                                accept="image/*" 
                                onChange={handleShapeFileChange} 
                            />

                            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                                <button 
                                    onClick={traceCustomOutline}
                                    disabled={isTracing || !shapeImageSrc}
                                    style={{
                                        padding: '12px 24px',
                                        borderRadius: '12px',
                                        background: '#6366f1',
                                        color: '#fff',
                                        border: 'none',
                                        cursor: isTracing || !shapeImageSrc ? 'not-allowed' : 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        opacity: !shapeImageSrc ? 0.5 : 1
                                    }}
                                >
                                    {isTracing ? <RefreshCw className="spin" size={16} /> : <Play size={16} />} 
                                    {isTracing ? 'Tracing...' : 'Trace Outline'}
                                </button>
                                <button 
                                    onClick={() => setActiveTab('standard')}
                                    style={{
                                        padding: '12px 24px',
                                        borderRadius: '12px',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#fff',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                    }}
                                >
                                    Back to Standard Shapes
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            background: 'rgba(255,255,255,0.015)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '24px',
                            padding: '24px',
                            display: 'grid',
                            gridTemplateColumns: '1.5fr 1fr',
                            gap: '32px',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.05em' }}>CUSTOM TRACED FRAME</h3>
                                    <button 
                                        onClick={() => setCustomPathData(null)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#ef4444',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '10px',
                                            fontWeight: '600'
                                        }}
                                    >
                                        <RefreshCw size={10} /> Retrace
                                    </button>
                                </div>
                                <div style={{
                                    width: '100%',
                                    height: '350px',
                                    background: '#070707',
                                    backgroundImage: `url('${transparentPattern}')`,
                                    borderRadius: '16px',
                                    border: '1px solid rgba(255,255,255,0.02)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        width: '280px',
                                        height: '280px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative'
                                    }}>
                                        {renderTagSvgContent('custom')}
                                    </div>
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '10px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        backgroundColor: 'rgba(5, 5, 5, 0.75)',
                                        borderRadius: '8px',
                                        padding: '4px 10px',
                                        fontSize: '9px',
                                        color: '#888',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        pointerEvents: 'none',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <Move size={10} /> {tagConfigs['custom'].showHole ? 'Drag image or keyhole to position' : 'Drag image to position'}
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                                    <p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#8b5cf6', fontWeight: 'bold', letterSpacing: '0.05em' }}>Calibration Settings</p>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {/* Width */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                            <span>Tag Width</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <input
                                                    type="number" min={30} max={1000} value={tagConfigs['custom'].width}
                                                    onChange={(e) => {
                                                        const raw = parseInt(e.target.value);
                                                        if (!isNaN(raw)) setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, width: raw } }));
                                                    }}
                                                    onBlur={(e) => {
                                                        const val = Math.max(30, Math.min(1000, parseInt(e.target.value) || 30));
                                                        setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, width: val } }));
                                                    }}
                                                    style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                />
                                                <span style={{ color: '#888', fontSize: '10px' }}>mm</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" min="30" max="1000" value={tagConfigs['custom'].width} 
                                            onChange={(e) => setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, width: parseInt(e.target.value) } }))}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>

                                    
                                    {/* Border Margin (Artwork Inset) */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                            <span>Border Margin</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={12}
                                                    step={0.5}
                                                    value={tagConfigs['custom'].borderWidth}
                                                    onChange={(e) => {
                                                        const raw = parseFloat(e.target.value);
                                                        if (!isNaN(raw)) setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, borderWidth: raw } }));
                                                    }}
                                                    onBlur={(e) => {
                                                        const val = Math.max(0, Math.min(12, parseFloat(e.target.value) || 0));
                                                        setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, borderWidth: val } }));
                                                    }}
                                                    style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                />
                                                <span style={{ color: '#888', fontSize: '10px' }}>mm</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="12" 
                                            step="0.5"
                                            value={tagConfigs['custom'].borderWidth} 
                                            onChange={(e) => setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, borderWidth: parseFloat(e.target.value) } }))}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>
                                    
                                    {/* Keyhole Toggle */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                                        <span style={{ fontSize: '11px', color: '#bbb' }}>Keyhole</span>
                                        <button
                                            onClick={() => setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, showHole: !prev.custom.showHole } }))}
                                            style={{
                                                width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', position: 'relative',
                                                background: tagConfigs['custom'].showHole ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.1)',
                                                transition: 'background 0.25s ease', padding: 0,
                                            }}
                                        >
                                            <div style={{
                                                width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute',
                                                top: '3px', left: tagConfigs['custom'].showHole ? '21px' : '3px', transition: 'left 0.25s ease',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                            }} />
                                        </button>
                                    </div>
                                    
                                    {tagConfigs['custom'].showHole && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                            <span>Keyhole Diameter</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <input
                                                    type="number" min={3} max={10} step={0.5} value={tagConfigs['custom'].holeDiameter}
                                                    onChange={(e) => {
                                                        const raw = parseFloat(e.target.value);
                                                        if (!isNaN(raw)) setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, holeDiameter: raw } }));
                                                    }}
                                                    onBlur={(e) => {
                                                        const val = Math.max(3, Math.min(10, parseFloat(e.target.value) || 3));
                                                        setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, holeDiameter: val } }));
                                                    }}
                                                    style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                />
                                                <span style={{ color: '#888', fontSize: '10px' }}>mm</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" min="3" max="10" step="0.5" value={tagConfigs['custom'].holeDiameter} 
                                            onChange={(e) => setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, holeDiameter: parseFloat(e.target.value) } }))}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>
                                    )}

                                    {/* Image Zoom scale */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#bbb', marginBottom: '4px' }}>
                                            <span>Image Scale</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <input
                                                    type="number" min={20} max={300} value={Math.round(tagConfigs['custom'].imageScale * 100)}
                                                    onChange={(e) => {
                                                        const raw = parseInt(e.target.value);
                                                        if (!isNaN(raw)) setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, imageScale: raw / 100 } }));
                                                    }}
                                                    onBlur={(e) => {
                                                        const pct = Math.max(20, Math.min(300, parseInt(e.target.value) || 100));
                                                        setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, imageScale: pct / 100 } }));
                                                    }}
                                                    style={{ width: '52px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '11px', padding: '2px 6px', textAlign: 'right', outline: 'none' }}
                                                />
                                                <span style={{ color: '#888', fontSize: '10px' }}>%</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" min="0.2" max="3.0" step="0.05" value={tagConfigs['custom'].imageScale} 
                                            onChange={(e) => setTagConfigs(prev => ({ ...prev, custom: { ...prev.custom, imageScale: parseFloat(e.target.value) } }))}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: 'auto' }}>
                                    <button
                                        onClick={() => handleDownloadCut('custom')}
                                        style={{
                                            padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                                            borderRadius: '12px', color: '#ef4444', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        }}
                                    >
                                        <Download size={12} /> Cut Image
                                    </button>
                                    <button
                                        onClick={() => handleDownloadEngrave('custom')}
                                        style={{
                                            padding: '12px', backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)',
                                            borderRadius: '12px', color: '#818cf8', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        }}
                                    >
                                        <Download size={12} /> Engrave Image
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Batch Export Panel */}
            {(activeTab === 'standard' || activeTab === 'custom') && (
            <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(16, 185, 129, 0.02) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '24px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(16, 185, 129, 0.1)', paddingBottom: '16px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#10b981', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={18} /> AUTOMATED BATCH BOARD NESTING
                    </h3>
                </div>
                
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    
                    {/* Left Column: Dimensions & Interlock Config */}
                    <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '300px' }}>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ flex: '1' }}>
                                <p style={{ fontSize: '12px', color: '#bbb', marginBottom: '8px', fontWeight: 'bold' }}>Board Width (mm)</p>
                                <input
                                    type="number" min={50} max={3000} value={boardWidth}
                                    onChange={(e) => { const raw = parseInt(e.target.value); if (!isNaN(raw)) setBoardWidth(raw); }}
                                    onBlur={(e) => setBoardWidth(Math.max(50, Math.min(3000, parseInt(e.target.value) || 50)))}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontWeight: '600', fontSize: '16px', padding: '12px', outline: 'none' }}
                                />
                            </div>
                            <div style={{ flex: '1' }}>
                                <p style={{ fontSize: '12px', color: '#bbb', marginBottom: '8px', fontWeight: 'bold' }}>Board Height (mm)</p>
                                <input
                                    type="number" min={50} max={3000} value={boardHeight}
                                    onChange={(e) => { const raw = parseInt(e.target.value); if (!isNaN(raw)) setBoardHeight(raw); }}
                                    onBlur={(e) => setBoardHeight(Math.max(50, Math.min(3000, parseInt(e.target.value) || 50)))}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontWeight: '600', fontSize: '16px', padding: '12px', outline: 'none' }}
                                />
                            </div>
                        </div>

                        {/* Interlocking Controls */}
                        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div>
                                    <h4 style={{ fontSize: '13px', color: '#fff', fontWeight: 'bold', margin: 0 }}>Advanced Interlocking (Tessellation)</h4>
                                    <p style={{ fontSize: '10px', color: '#888', margin: '4px 0 0 0' }}>Flips alternating rows to squish irregular shapes tighter.</p>
                                </div>
                                <button
                                    onClick={() => setIsInterlocked(!isInterlocked)}
                                    style={{
                                        width: '44px', height: '24px', borderRadius: '12px',
                                        background: isInterlocked ? '#10b981' : 'rgba(255,255,255,0.1)',
                                        border: 'none', position: 'relative', cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{
                                        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                        position: 'absolute', top: '3px', left: isInterlocked ? '23px' : '3px', transition: 'all 0.2s'
                                    }} />
                                </button>
                            </div>

                            {isInterlocked && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#bbb', marginBottom: '8px' }}>
                                            <span>Vertical Squeeze (Overlap)</span>
                                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>{interlockSqueeze} mm</span>
                                        </div>
                                        <input 
                                            type="range" min={0} max={100} value={interlockSqueeze}
                                            onChange={(e) => setInterlockSqueeze(parseInt(e.target.value))}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#bbb', marginBottom: '8px' }}>
                                            <span>Horizontal Shift</span>
                                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>{interlockShift} mm</span>
                                        </div>
                                        <input 
                                            type="range" min={-100} max={100} value={interlockShift}
                                            onChange={(e) => setInterlockShift(parseInt(e.target.value))}
                                            style={{ width: '100%', cursor: 'pointer' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Mini Preview & Generate */}
                    <div style={{ flex: '1', minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        
                        <div style={{ 
                            flex: 1, minHeight: '180px', background: '#050505', borderRadius: '16px', 
                            border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px',
                            display: 'flex', flexDirection: 'column'
                        }}>
                            <span style={{ fontSize: '10px', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '8px' }}>
                                Grid Layout Preview
                            </span>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                {renderMiniBatchPreview(activeTab === 'custom' ? 'custom' : batchStandardShape)}
                            </div>
                        </div>

                        <div>
                            {activeTab === 'standard' && (
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '11px', color: '#888', alignSelf: 'center' }}>Shape to Batch:</span>
                                    <select 
                                        value={batchStandardShape} 
                                        onChange={e => setBatchStandardShape(e.target.value)}
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', outline: 'none', cursor: 'pointer' }}
                                    >
                                        <option value="square">Square</option>
                                        <option value="heart">Heart</option>
                                        <option value="circle">Circle</option>
                                    </select>
                                </div>
                            )}
                            <button 
                                onClick={() => handleDownloadBatch(activeTab === 'custom' ? 'custom' : batchStandardShape)}
                                disabled={isGeneratingBatch || (activeTab === 'custom' && !customPathData)}
                                style={{
                                    width: '100%', padding: '14px 20px', borderRadius: '12px',
                                    background: '#10b981', color: '#fff', border: 'none', cursor: isGeneratingBatch ? 'not-allowed' : 'pointer',
                                    fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    opacity: (isGeneratingBatch || (activeTab === 'custom' && !customPathData)) ? 0.5 : 1,
                                    transition: 'all 0.2s', height: '47px'
                                }}
                            >
                                {isGeneratingBatch ? <RefreshCw className="spin" size={18} /> : <Download size={18} />} 
                                {isGeneratingBatch ? 'Packing & Generating...' : `Generate Full Board`}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
            )}

        </div>
    );
};

export default KeyTagsModule;
