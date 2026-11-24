import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Scissors, Layers, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

const ArtworkPrepModule = () => {
    const [imageSrc, setImageSrc] = useState(null);
    const [imageName, setImageName] = useState('artwork');
    const [naturalW, setNaturalW] = useState(0);
    const [naturalH, setNaturalH] = useState(0);

    const [isProcessing, setIsProcessing] = useState(false);
    const [cutUrl, setCutUrl] = useState(null);     // Base outline without holes
    const [engraveUrl, setEngraveUrl] = useState(null); // Base engrave without holes knocked out
    const [error, setError] = useState(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // Interactive Holes state
    const [holes, setHoles] = useState([]); 
    const [holeDiameter, setHoleDiameter] = useState(30); 
    const [draggingIdx, setDraggingIdx] = useState(null);
    const [selectedHoleIdx, setSelectedHoleIdx] = useState(null);
    const svgRef = useRef(null);

    const fileInputRef = useRef(null);

    const loadFile = useCallback((file) => {
        if (!file || !file.type.startsWith('image/')) return;
        setError(null);
        setCutUrl(null);
        setEngraveUrl(null);
        setHoles([]);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                setNaturalW(img.naturalWidth);
                setNaturalH(img.naturalHeight);
                setImageSrc(ev.target.result);
                setImageName(file.name.replace(/\.[^/.]+$/, ''));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }, []);

    const handleFileChange = (e) => loadFile(e.target.files?.[0]);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        loadFile(e.dataTransfer.files?.[0]);
    };

    const processImage = () => {
        if (!imageSrc) return;
        setIsProcessing(true);
        setError(null);

        setTimeout(() => {
            try {
                const img = new Image();
                img.onload = () => {
                    const W = img.naturalWidth;
                    const H = img.naturalHeight;
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = W; canvas.height = H;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, W, H);
                    const imgData = ctx.getImageData(0, 0, W, H);
                    const data = imgData.data;

                    // 1. Create binary foreground mask
                    const foreground = new Uint8Array(W * H);
                    for (let i = 0; i < W * H; i++) {
                        const idx = i * 4;
                        const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
                        if (a >= 50 && (r <= 240 || g <= 240 || b <= 240)) {
                            foreground[i] = 1;
                        }
                    }

                    // 2. Morphological Closing to bridge gaps
                    const closeRadius = Math.max(2, Math.floor(Math.min(W, H) * 0.003)); 
                    
                    const dilate1D = (input, w, h, radius) => {
                        const temp = new Uint8Array(w * h);
                        for (let y = 0; y < h; y++) {
                            let offset = y * w;
                            for (let x = 0; x < w; x++) {
                                if (input[offset + x] === 1) {
                                    let minX = Math.max(0, x - radius), maxX = Math.min(w - 1, x + radius);
                                    for (let nx = minX; nx <= maxX; nx++) temp[offset + nx] = 1;
                                }
                            }
                        }
                        const out = new Uint8Array(w * h);
                        for (let x = 0; x < w; x++) {
                            for (let y = 0; y < h; y++) {
                                if (temp[y * w + x] === 1) {
                                    let minY = Math.max(0, y - radius), maxY = Math.min(h - 1, y + radius);
                                    for (let ny = minY; ny <= maxY; ny++) out[ny * w + x] = 1;
                                }
                            }
                        }
                        return out;
                    };

                    const erode1D = (input, w, h, radius) => {
                        const temp = new Uint8Array(input);
                        for (let y = 0; y < h; y++) {
                            let offset = y * w;
                            for (let x = 0; x < w; x++) {
                                if (input[offset + x] === 0) {
                                    let minX = Math.max(0, x - radius), maxX = Math.min(w - 1, x + radius);
                                    for (let nx = minX; nx <= maxX; nx++) temp[offset + nx] = 0;
                                }
                            }
                        }
                        const out = new Uint8Array(temp);
                        for (let x = 0; x < w; x++) {
                            for (let y = 0; y < h; y++) {
                                if (temp[y * w + x] === 0) {
                                    let minY = Math.max(0, y - radius), maxY = Math.min(h - 1, y + radius);
                                    for (let ny = minY; ny <= maxY; ny++) out[ny * w + x] = 0;
                                }
                            }
                        }
                        return out;
                    };

                    const dilatedFg = dilate1D(foreground, W, H, closeRadius);
                    const closedFg = erode1D(dilatedFg, W, H, closeRadius);

                    // 3. BFS Flood Fill to find pure exterior
                    const exterior = new Uint8Array(W * H);
                    const queue = new Int32Array(W * H);
                    let head = 0;
                    let tail = 0;

                    const tryPush = (x, y) => {
                        if (x < 0 || x >= W || y < 0 || y >= H) return;
                        const i = y * W + x;
                        if (exterior[i] === 0 && closedFg[i] === 0) {
                            exterior[i] = 1;
                            queue[tail++] = i;
                        }
                    };

                    for (let x = 0; x < W; x++) { tryPush(x, 0); tryPush(x, H - 1); }
                    for (let y = 0; y < H; y++) { tryPush(0, y); tryPush(W - 1, y); }

                    while (head < tail) {
                        const i = queue[head++];
                        const x = i % W;
                        const y = Math.floor(i / W);
                        tryPush(x - 1, y);
                        tryPush(x + 1, y);
                        tryPush(x, y - 1);
                        tryPush(x, y + 1);
                    }

                    // 4. Find disconnected shapes to initialize holes
                    const interior = new Uint8Array(W * H);
                    for (let i = 0; i < W * H; i++) interior[i] = exterior[i] === 0 ? 1 : 0;
                    
                    const labels = new Int32Array(W * H);
                    let currentLabel = 1;
                    const bboxes = [];
                    
                    for (let i = 0; i < W * H; i++) {
                        if (interior[i] === 1 && labels[i] === 0) {
                            let minX = W, maxX = 0, minY = H, maxY = 0;
                            let qHead = 0, qTail = 0;
                            labels[i] = currentLabel;
                            queue[qTail++] = i;
                            
                            while (qHead < qTail) {
                                const curr = queue[qHead++];
                                const cx = curr % W;
                                const cy = Math.floor(curr / W);
                                if (cx < minX) minX = cx;
                                if (cx > maxX) maxX = cx;
                                if (cy < minY) minY = cy;
                                if (cy > maxY) maxY = cy;
                                
                                const nbs = [curr - 1, curr + 1, curr - W, curr + W];
                                for (let nb of nbs) {
                                    if (nb >= 0 && nb < W * H && interior[nb] === 1 && labels[nb] === 0) {
                                        labels[nb] = currentLabel;
                                        queue[qTail++] = nb;
                                    }
                                }
                            }
                            
                            // Ignore tiny artifacts
                            if (maxX - minX > 20 && maxY - minY > 20) {
                                bboxes.push({ id: currentLabel, minX, maxX, minY, maxY });
                                currentLabel++;
                            }
                        }
                    }

                    const defaultHoleDiam = Math.max(10, Math.floor(Math.min(W, H) * 0.025));
                    setHoleDiameter(defaultHoleDiam);
                    
                    const initialHoles = bboxes.map(bb => ({
                        id: bb.id,
                        x: bb.minX + (bb.maxX - bb.minX) / 2,
                        y: bb.minY + (defaultHoleDiam * 1.5) // Put hole near the top
                    }));
                    setHoles(initialHoles);

                    // 5. Generate Cut Outline 
                    const cutData = new ImageData(W, H);
                    const cutPixels = cutData.data;
                    const outlineThickness = Math.max(1, Math.floor(Math.min(W, H) * 0.002));

                    for (let y = 0; y < H; y++) {
                        for (let x = 0; x < W; x++) {
                            const i = y * W + x;
                            const outIdx = i * 4;
                            
                            if (exterior[i] === 0) {
                                let nearExterior = false;
                                for (let dy = -outlineThickness; dy <= outlineThickness; dy++) {
                                    for (let dx = -outlineThickness; dx <= outlineThickness; dx++) {
                                        const nx = x + dx, ny = y + dy;
                                        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
                                            if (exterior[ny * W + nx] === 1) {
                                                nearExterior = true;
                                                break;
                                            }
                                        }
                                    }
                                    if (nearExterior) break;
                                }

                                if (nearExterior) {
                                    cutPixels[outIdx] = 0; cutPixels[outIdx+1] = 0; cutPixels[outIdx+2] = 0; cutPixels[outIdx+3] = 255; 
                                } else {
                                    cutPixels[outIdx+3] = 0; 
                                }
                            } else {
                                cutPixels[outIdx+3] = 0; 
                            }
                        }
                    }

                    const cutCanvas = document.createElement('canvas');
                    cutCanvas.width = W; cutCanvas.height = H;
                    cutCanvas.getContext('2d').putImageData(cutData, 0, 0);
                    setCutUrl(cutCanvas.toDataURL('image/png'));

                    // 6. Generate Engrave (Original with exterior knocked out)
                    const engraveData = new ImageData(new Uint8ClampedArray(data), W, H);
                    const engravePixels = engraveData.data;
                    for (let i = 0; i < W * H; i++) {
                        if (exterior[i] === 1) {
                            engravePixels[i * 4 + 3] = 0;
                        }
                    }
                    
                    const engraveCanvas = document.createElement('canvas');
                    engraveCanvas.width = W; engraveCanvas.height = H;
                    engraveCanvas.getContext('2d').putImageData(engraveData, 0, 0);
                    setEngraveUrl(engraveCanvas.toDataURL('image/png'));

                    setIsProcessing(false);
                };
                img.src = imageSrc;
            } catch (err) {
                console.error(err);
                setError('Failed to process artwork. Please try a different image.');
                setIsProcessing(false);
            }
        }, 50);
    };

    // ── Interactive Drag & Nudge Logic ──
    const handlePointerMove = (e) => {
        if (draggingIdx === null || !svgRef.current) return;
        const pt = svgRef.current.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
        
        setHoles(prev => {
            const newHoles = [...prev];
            newHoles[draggingIdx] = { ...newHoles[draggingIdx], x: svgP.x, y: svgP.y };
            return newHoles;
        });
    };

    const handlePointerUp = () => setDraggingIdx(null);

    const handleSvgPointerDown = (e) => {
        // Deselect if clicking the background image or empty SVG space
        if (e.target.tagName === 'svg' || e.target.tagName === 'image') {
            setSelectedHoleIdx(null);
        }
    };

    // Keyboard nudging for selected hole
    useEffect(() => {
        if (selectedHoleIdx === null) return;
        
        const handleKeyDown = (e) => {
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault(); // prevent page scroll
            
            const step = e.shiftKey ? 10 : 1; // Shift + Arrow moves 10px
            setHoles(prev => {
                const newHoles = [...prev];
                const h = newHoles[selectedHoleIdx];
                if (!h) return prev;
                
                let dx = 0, dy = 0;
                if (e.key === 'ArrowUp') dy = -step;
                if (e.key === 'ArrowDown') dy = step;
                if (e.key === 'ArrowLeft') dx = -step;
                if (e.key === 'ArrowRight') dx = step;
                
                newHoles[selectedHoleIdx] = { ...h, x: h.x + dx, y: h.y + dy };
                return newHoles;
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedHoleIdx]);

    // ── Final Download Assembly ──
    const handleDownloadCut = () => {
        if (!cutUrl) return;
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = naturalW; canvas.height = naturalH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            ctx.lineWidth = Math.max(1, Math.floor(Math.min(naturalW, naturalH) * 0.002));
            ctx.strokeStyle = '#000000';
            holes.forEach(h => {
                ctx.beginPath();
                ctx.arc(h.x, h.y, holeDiameter / 2, 0, Math.PI * 2);
                ctx.stroke();
            });
            
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${imageName}_cut.png`;
            a.click();
        };
        img.src = cutUrl;
    };

    const handleDownloadEngrave = () => {
        if (!engraveUrl) return;
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = naturalW; canvas.height = naturalH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            ctx.globalCompositeOperation = 'destination-out';
            holes.forEach(h => {
                ctx.beginPath();
                ctx.arc(h.x, h.y, holeDiameter / 2, 0, Math.PI * 2);
                ctx.fill();
            });
            
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${imageName}_engrave.png`;
            a.click();
        };
        img.src = engraveUrl;
    };

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", color: '#fff' }}>
            <div style={{ marginBottom: '28px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', marginBottom: '6px' }}>
                    Artwork Prep
                    <span style={{ marginLeft: '10px', fontSize: '11px', fontWeight: '500', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', verticalAlign: 'middle' }}>
                        Auto-Extract + Keychains
                    </span>
                </h2>
                <p style={{ fontSize: '12px', color: '#555', letterSpacing: '0.02em' }}>
                    Upload your artwork → auto-detects all distinct shapes → add &amp; position keychain holes → export files.
                </p>
            </div>

            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                style={{
                    position: 'relative',
                    border: `2px dashed ${isDragOver ? '#6366f1' : imageSrc ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '24px',
                    padding: imageSrc ? '20px' : '60px 20px',
                    textAlign: 'center',
                    backgroundColor: isDragOver ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.25s ease',
                    marginBottom: '28px',
                }}
            >
                {!imageSrc ? (
                    <div onClick={() => fileInputRef.current?.click()} style={{ cursor: 'pointer' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <Upload size={24} color="#6366f1" />
                        </div>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: '#ccc', marginBottom: '6px' }}>Drop artwork sheet here or click</p>
                        <p style={{ fontSize: '12px', color: '#444' }}>PNG, JPG, WebP — works best with white background</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Source Image</p>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '12px', position: 'relative' }}>
                                <img
                                    src={imageSrc}
                                    alt="artwork"
                                    style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', borderRadius: '10px', display: 'block' }}
                                />
                                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px' }}
                                    >
                                        <Upload size={12} /> Change
                                    </button>
                                </div>
                                <p style={{ fontSize: '11px', color: '#444', marginTop: '8px' }}>{imageName} &nbsp;·&nbsp; {naturalW} × {naturalH}px</p>
                            </div>
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Extracted Outline &amp; Holes</p>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '12px', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {cutUrl ? (
                                    <svg
                                        ref={svgRef}
                                        viewBox={`0 0 ${naturalW} ${naturalH}`}
                                        onPointerDown={handleSvgPointerDown}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={handlePointerUp}
                                        onPointerLeave={handlePointerUp}
                                        style={{ width: '100%', maxHeight: '280px', display: 'block', touchAction: 'none' }}
                                    >
                                        <image href={cutUrl} width={naturalW} height={naturalH} 
                                               style={{ filter: 'drop-shadow(0 0 1px rgba(239,68,68,0.5)) invert(34%) sepia(98%) saturate(3419%) hue-rotate(345deg) brightness(96%) contrast(92%)' }} 
                                        />
                                        {holes.map((h, i) => (
                                            <g key={h.id}>
                                                {selectedHoleIdx === i && (
                                                    <circle
                                                        cx={h.x} cy={h.y}
                                                        r={(holeDiameter / 2) + Math.max(4, naturalW * 0.005)}
                                                        fill="none"
                                                        stroke="#fbbf24"
                                                        strokeWidth={Math.max(2, naturalW * 0.002)}
                                                        strokeDasharray="4 4"
                                                    />
                                                )}
                                                <circle 
                                                    cx={h.x} cy={h.y} 
                                                    r={holeDiameter / 2} 
                                                    fill={selectedHoleIdx === i ? "rgba(251,191,36,0.2)" : "rgba(239,68,68,0.2)"} 
                                                    stroke={selectedHoleIdx === i ? "#fbbf24" : "#ef4444"} 
                                                    strokeWidth={Math.max(2, naturalW * 0.002)} 
                                                />
                                                <circle
                                                    cx={h.x} cy={h.y}
                                                    r={Math.max(20, holeDiameter)} // larger invisible hit area
                                                    fill="transparent"
                                                    onPointerDown={(e) => { 
                                                        e.preventDefault(); 
                                                        e.stopPropagation();
                                                        setDraggingIdx(i); 
                                                        setSelectedHoleIdx(i);
                                                    }}
                                                    style={{ cursor: draggingIdx === i ? 'grabbing' : 'grab' }}
                                                />
                                            </g>
                                        ))}
                                    </svg>
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#444' }}>
                                        <Layers size={32} style={{ marginBottom: '10px', opacity: 0.4 }} />
                                        <p style={{ fontSize: '12px' }}>Click <strong style={{ color: '#6366f1' }}>Extract Shapes</strong></p>
                                    </div>
                                )}
                            </div>
                            
                            {/* Hole Size Slider */}
                            {cutUrl && holes.length > 0 && (
                                <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '600', textTransform: 'uppercase' }}>Global Hole Size</span>
                                        <span style={{ fontSize: '12px', color: '#fff', fontWeight: '600' }}>{holeDiameter}px</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min={10} max={Math.min(naturalW, naturalH) * 0.15} 
                                        value={holeDiameter} 
                                        onChange={(e) => setHoleDiameter(Number(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer', accentColor: '#ef4444' }}
                                    />
                                    <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', textAlign: 'center' }}>
                                        Drag circles to move. Click to select, then use <strong>Arrow Keys</strong> to nudge (hold Shift for large steps).
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px', color: '#f87171', fontSize: '13px' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {imageSrc && (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        onClick={processImage}
                        disabled={isProcessing}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none', color: '#fff', padding: '12px 24px',
                            borderRadius: '14px', cursor: isProcessing ? 'not-allowed' : 'pointer',
                            fontWeight: '700', fontSize: '13px', letterSpacing: '0.02em',
                            opacity: isProcessing ? 0.6 : 1,
                            boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <RefreshCw size={15} className={isProcessing ? 'spin' : ''} />
                        {isProcessing ? 'Processing…' : cutUrl ? 'Re-Extract' : 'Extract Shapes'}
                    </button>

                    {cutUrl && engraveUrl && (
                        <>
                            <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.08)' }} />

                            <button
                                onClick={handleDownloadCut}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                    color: '#f87171', padding: '12px 22px', borderRadius: '14px',
                                    cursor: 'pointer', fontWeight: '700', fontSize: '13px', letterSpacing: '0.02em',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.22)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
                            >
                                <Scissors size={15} /> Download Cut Image
                            </button>

                            <button
                                onClick={handleDownloadEngrave}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                                    color: '#a5b4fc', padding: '12px 22px', borderRadius: '14px',
                                    cursor: 'pointer', fontWeight: '700', fontSize: '13px', letterSpacing: '0.02em',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.22)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.12)'}
                            >
                                <Layers size={15} /> Download Engrave Image
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '8px 14px', color: '#4ade80', fontSize: '12px', fontWeight: '600' }}>
                                <CheckCircle2 size={14} /> Ready
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default ArtworkPrepModule;
