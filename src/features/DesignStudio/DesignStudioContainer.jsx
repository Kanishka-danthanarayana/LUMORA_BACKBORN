import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, Type, ImagePlus, Download, Trash2, Eye, EyeOff, Move, RotateCw, Layers, Plus, FileImage, FileCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── helpers ─── */
const uid = () => Math.random().toString(36).slice(2, 10);

const MM_TO_PX = 3.7795275591; // 1 mm ≈ 3.78 px (96 dpi)

const parseSvgDimensions = (svgText) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;

    let widthMM = 0, heightMM = 0;
    const wAttr = svg.getAttribute('width') || '';
    const hAttr = svg.getAttribute('height') || '';

    // Try mm units
    if (wAttr.includes('mm')) {
        widthMM = parseFloat(wAttr);
        heightMM = parseFloat(hAttr);
    } else {
        // Use viewBox
        const vb = svg.getAttribute('viewBox');
        if (vb) {
            const parts = vb.split(/[\s,]+/).map(Number);
            widthMM = parts[2];
            heightMM = parts[3];
        }
    }

    const viewBox = svg.getAttribute('viewBox');
    return { widthMM, heightMM, viewBox, svgElement: svg };
};

/* ─── layer defaults ─── */
const createTextLayer = () => ({
    id: uid(),
    type: 'text',
    text: 'Your Text',
    x: 50,
    y: 50,
    fontSize: 24,
    fontFamily: 'Inter',
    fontWeight: '700',
    fill: '#ffffff',
    rotation: 0,
    visible: true,
    name: 'Text Layer',
});

const createImageLayer = (src, name, w, h) => ({
    id: uid(),
    type: 'image',
    src,
    x: 50,
    y: 50,
    width: w || 100,
    height: h || 100,
    rotation: 0,
    visible: true,
    name: name || 'Image Layer',
});

/* ─── colour palette ─── */
const ACCENT = '#8b5cf6';
const ACCENT_DIM = 'rgba(139,92,246,0.15)';

/* ══════════════════════════════════════════════════════════ */
const DesignStudioContainer = ({ onBack }) => {
    /* ── state ── */
    const [svgText, setSvgText] = useState(null);
    const [svgDims, setSvgDims] = useState(null);
    const [layers, setLayers] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [fitZoom, setFitZoom] = useState(1);

    const canvasRef = useRef(null);
    const canvasAreaRef = useRef(null);
    const fileInputRef = useRef(null);
    const imgInputRef = useRef(null);

    /* ── drag state ── */
    const [dragging, setDragging] = useState(null);
    const [resizing, setResizing] = useState(null);
    const dragStart = useRef({ x: 0, y: 0, layerX: 0, layerY: 0 });
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    /* ── derived ── */
    const selectedLayer = layers.find(l => l.id === selectedId);

    /* ─── compute fit zoom ─── */
    const computeFitZoom = useCallback((dims) => {
        const area = canvasAreaRef.current;
        if (!area || !dims) return 1;
        const padding = 80; // total padding around the canvas
        const availW = area.clientWidth - padding;
        const availH = area.clientHeight - padding;
        const scaleX = availW / (dims.widthMM * MM_TO_PX);
        const scaleY = availH / (dims.heightMM * MM_TO_PX);
        return Math.min(scaleX, scaleY, 4); // cap at 4x
    }, []);

    /* ─── load SVG ─── */
    const handleLoadSvg = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            const dims = parseSvgDimensions(text);
            if (dims) {
                setSvgText(text);
                setSvgDims(dims);
                // Auto-fit after next render
                requestAnimationFrame(() => {
                    const fit = computeFitZoom(dims);
                    setFitZoom(fit);
                    setZoom(fit);
                });
            }
        };
        reader.readAsText(file);
    };

    /* ─── recompute fit zoom on resize ─── */
    useEffect(() => {
        const handleResize = () => {
            if (svgDims) {
                const fit = computeFitZoom(svgDims);
                setFitZoom(fit);
                setZoom(fit);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [svgDims, computeFitZoom]);

    /* ─── add text layer ─── */
    const addTextLayer = () => {
        const l = createTextLayer();
        setLayers(prev => [...prev, l]);
        setSelectedId(l.id);
    };

    /* ─── add image layer ─── */
    const handleAddImage = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                // Scale to fit within 150px max
                const scale = Math.min(150 / img.width, 150 / img.height, 1);
                const l = createImageLayer(ev.target.result, file.name, img.width * scale, img.height * scale);
                setLayers(prev => [...prev, l]);
                setSelectedId(l.id);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    };

    /* ─── update layer ─── */
    const updateLayer = (id, patch) =>
        setLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));

    const deleteLayer = (id) => {
        setLayers(prev => prev.filter(l => l.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const moveLayerUp = (id) => {
        setLayers(prev => {
            const idx = prev.findIndex(l => l.id === id);
            if (idx < prev.length - 1) {
                const copy = [...prev];
                [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
                return copy;
            }
            return prev;
        });
    };

    const moveLayerDown = (id) => {
        setLayers(prev => {
            const idx = prev.findIndex(l => l.id === id);
            if (idx > 0) {
                const copy = [...prev];
                [copy[idx], copy[idx - 1]] = [copy[idx - 1], copy[idx]];
                return copy;
            }
            return prev;
        });
    };

    /* ─── drag handlers ─── */
    const onPointerDownLayer = (e, layer) => {
        e.stopPropagation();
        setSelectedId(layer.id);
        setDragging(layer.id);
        const rect = canvasRef.current.getBoundingClientRect();
        dragStart.current = {
            x: e.clientX,
            y: e.clientY,
            layerX: layer.x,
            layerY: layer.y,
        };
    };

    const onPointerDownResize = (e, layer) => {
        e.stopPropagation();
        setResizing(layer.id);
        resizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            w: layer.width,
            h: layer.height,
        };
    };

    const onPointerMove = useCallback((e) => {
        if (dragging) {
            const dx = (e.clientX - dragStart.current.x) / zoom;
            const dy = (e.clientY - dragStart.current.y) / zoom;
            updateLayer(dragging, {
                x: dragStart.current.layerX + dx,
                y: dragStart.current.layerY + dy,
            });
        }
        if (resizing) {
            const dx = (e.clientX - resizeStart.current.x) / zoom;
            const dy = (e.clientY - resizeStart.current.y) / zoom;
            updateLayer(resizing, {
                width: Math.max(20, resizeStart.current.w + dx),
                height: Math.max(20, resizeStart.current.h + dy),
            });
        }
    }, [dragging, resizing, zoom]);

    const onPointerUp = useCallback(() => {
        setDragging(null);
        setResizing(null);
    }, []);

    useEffect(() => {
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, [onPointerMove, onPointerUp]);

    /* ─── export helpers ─── */
    const buildExportSvg = () => {
        if (!svgText || !svgDims) return null;

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const svg = doc.querySelector('svg');

        // Add overlay layers as new SVG elements
        const vb = svg.getAttribute('viewBox');
        const vbParts = vb ? vb.split(/[\s,]+/).map(Number) : [0, 0, svgDims.widthMM, svgDims.heightMM];

        layers.filter(l => l.visible).forEach(layer => {
            if (layer.type === 'text') {
                const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', String(layer.x));
                text.setAttribute('y', String(layer.y));
                text.setAttribute('fill', layer.fill);
                text.setAttribute('font-size', String(layer.fontSize));
                text.setAttribute('font-family', layer.fontFamily);
                text.setAttribute('font-weight', layer.fontWeight);
                if (layer.rotation) {
                    text.setAttribute('transform', `rotate(${layer.rotation} ${layer.x} ${layer.y})`);
                }
                text.textContent = layer.text;
                svg.appendChild(text);
            }
            if (layer.type === 'image') {
                const img = doc.createElementNS('http://www.w3.org/2000/svg', 'image');
                img.setAttribute('x', String(layer.x));
                img.setAttribute('y', String(layer.y));
                img.setAttribute('width', String(layer.width));
                img.setAttribute('height', String(layer.height));
                img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', layer.src);
                if (layer.rotation) {
                    const cx = layer.x + layer.width / 2;
                    const cy = layer.y + layer.height / 2;
                    img.setAttribute('transform', `rotate(${layer.rotation} ${cx} ${cy})`);
                }
                svg.appendChild(img);
            }
        });

        const serializer = new XMLSerializer();
        return serializer.serializeToString(svg);
    };

    const downloadSvg = () => {
        const data = buildExportSvg();
        if (!data) return;
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'design-export.svg';
        a.click();
    };

    const downloadPng = () => {
        const data = buildExportSvg();
        if (!data) return;
        const widthPx = Math.round(svgDims.widthMM * MM_TO_PX);
        const heightPx = Math.round(svgDims.heightMM * MM_TO_PX);

        const canvas = document.createElement('canvas');
        canvas.width = widthPx;
        canvas.height = heightPx;
        const ctx = canvas.getContext('2d');

        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, widthPx, heightPx);
            const pngUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = 'design-export.png';
            a.click();
        };
        img.src = url;
    };

    /* ─── view size for canvas area ─── */
    const canvasW = svgDims ? svgDims.widthMM * MM_TO_PX : 600;
    const canvasH = svgDims ? svgDims.heightMM * MM_TO_PX : 600;

    /* ══════════════════════════════════════════════════════════ */
    /*                          RENDER                            */
    /* ══════════════════════════════════════════════════════════ */
    return (
        <div style={{ backgroundColor: '#050505', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column' }}>
            <style dangerouslySetInnerHTML={{ __html: `
                .svg-base-layer > svg {
                    width: 100% !important;
                    height: 100% !important;
                }
            ` }} />
            {/* ── HEADER ── */}
            <header style={{ padding: '20px 40px', display: 'flex', alignItems: 'center', gap: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={onBack} style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px', borderRadius: '14px', cursor: 'pointer' }}><ChevronLeft /></button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '20px', fontWeight: '900', fontStyle: 'italic' }}>DESIGN STUDIO <span style={{ color: ACCENT, fontStyle: 'normal', fontSize: '11px', verticalAlign: 'middle', marginLeft: '10px' }}>LAYER COMPOSER</span></h1>
                </div>

                {/* ── toolbar ── */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input ref={fileInputRef} type="file" accept=".svg" onChange={handleLoadSvg} style={{ display: 'none' }} />
                    <ToolBtn icon={<FileCode size={16} />} label="Load SVG" onClick={() => fileInputRef.current?.click()} />
                    <ToolBtn icon={<Type size={16} />} label="Add Text" onClick={addTextLayer} disabled={!svgText} />
                    <input ref={imgInputRef} type="file" accept="image/*" onChange={handleAddImage} style={{ display: 'none' }} />
                    <ToolBtn icon={<ImagePlus size={16} />} label="Add Image" onClick={() => imgInputRef.current?.click()} disabled={!svgText} />
                    <div style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 6px' }} />
                    <ToolBtn icon={<FileCode size={16} />} label="Export SVG" accent onClick={downloadSvg} disabled={!svgText} />
                    <ToolBtn icon={<FileImage size={16} />} label="Export PNG" accent onClick={downloadPng} disabled={!svgText} />
                </div>
            </header>

            {/* ── BODY ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── CANVAS AREA ── */}
                <div ref={canvasAreaRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', position: 'relative', overflow: 'auto' }}
                    onClick={() => setSelectedId(null)}
                >
                    {!svgText ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
                                padding: '80px', borderRadius: '32px',
                                border: '2px dashed rgba(255,255,255,0.06)', cursor: 'pointer',
                                textAlign: 'center',
                            }}
                            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        >
                            <FileCode size={48} style={{ color: ACCENT, opacity: 0.6 }} />
                            <p style={{ fontWeight: '700', fontSize: '16px' }}>Load an SVG file to begin</p>
                            <p style={{ color: '#555', fontSize: '12px' }}>Drop or click to select your base SVG</p>
                        </motion.div>
                    ) : (
                        <div style={{ padding: '40px' }}>

                            {/* SVG canvas */}
                            <div ref={canvasRef}
                                style={{
                                    position: 'relative',
                                    width: canvasW * zoom,
                                    height: canvasH * zoom,
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    boxShadow: `0 0 80px ${ACCENT}10`,
                                    backgroundColor: '#fff',
                                }}
                            >
                                {/* Base SVG layer */}
                                <div
                                    className="svg-base-layer"
                                    dangerouslySetInnerHTML={{ __html: svgText }}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                    }}
                                />

                                {/* Overlay layers */}
                                {layers.filter(l => l.visible).map(layer => (
                                    <div
                                        key={layer.id}
                                        onPointerDown={(e) => onPointerDownLayer(e, layer)}
                                        style={{
                                            position: 'absolute',
                                            left: layer.x * zoom,
                                            top: layer.y * zoom,
                                            transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
                                            cursor: 'move',
                                            border: selectedId === layer.id ? `2px solid ${ACCENT}` : '2px solid transparent',
                                            borderRadius: '4px',
                                            userSelect: 'none',
                                            zIndex: 10,
                                        }}
                                    >
                                        {layer.type === 'text' && (
                                            <span style={{
                                                fontSize: layer.fontSize * zoom,
                                                fontFamily: layer.fontFamily,
                                                fontWeight: layer.fontWeight,
                                                color: layer.fill,
                                                whiteSpace: 'nowrap',
                                                display: 'block',
                                                padding: '2px 4px',
                                                lineHeight: 1.2,
                                            }}>{layer.text}</span>
                                        )}
                                        {layer.type === 'image' && (
                                            <>
                                                <img
                                                    src={layer.src}
                                                    alt={layer.name}
                                                    draggable={false}
                                                    style={{
                                                        width: layer.width * zoom,
                                                        height: layer.height * zoom,
                                                        display: 'block',
                                                        pointerEvents: 'none',
                                                    }}
                                                />
                                                {selectedId === layer.id && (
                                                    <div
                                                        onPointerDown={(e) => onPointerDownResize(e, layer)}
                                                        style={{
                                                            position: 'absolute',
                                                            right: -6,
                                                            bottom: -6,
                                                            width: 12,
                                                            height: 12,
                                                            backgroundColor: ACCENT,
                                                            borderRadius: '3px',
                                                            cursor: 'nwse-resize',
                                                        }}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── RIGHT PANEL ── */}
                <div style={{
                    width: '320px', borderLeft: '1px solid rgba(255,255,255,0.05)',
                    backgroundColor: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                }}>

                    {/* Layers list */}
                    <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#777' }}>
                                <Layers size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Layers
                            </h3>
                            <span style={{ fontSize: '10px', color: '#444' }}>{layers.length} items</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
                            {layers.map(layer => (
                                <motion.div
                                    key={layer.id}
                                    layout
                                    onClick={() => setSelectedId(layer.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '10px 12px', borderRadius: '10px',
                                        backgroundColor: selectedId === layer.id ? ACCENT_DIM : 'rgba(255,255,255,0.02)',
                                        border: selectedId === layer.id ? `1px solid rgba(139,92,246,0.3)` : '1px solid transparent',
                                        cursor: 'pointer', fontSize: '12px',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <span style={{ width: '18px', textAlign: 'center', color: '#555' }}>
                                        {layer.type === 'text' ? <Type size={13} /> : <ImagePlus size={13} />}
                                    </span>
                                    <span style={{ flex: 1, fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layer.name}</span>
                                    <button onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }); }}
                                        style={{ background: 'none', border: 'none', color: layer.visible ? '#888' : '#333', cursor: 'pointer', padding: '2px' }}>
                                        {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                                        style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '2px' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </motion.div>
                            ))}

                            {layers.length === 0 && (
                                <p style={{ color: '#333', fontSize: '11px', textAlign: 'center', padding: '20px 0' }}>No layers yet</p>
                            )}
                        </div>
                    </div>

                    {/* Properties panel */}
                    <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                        <h3 style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#777', marginBottom: '16px' }}>Properties</h3>

                        {!selectedLayer && (
                            <p style={{ color: '#333', fontSize: '12px' }}>Select a layer to edit its properties</p>
                        )}

                        {selectedLayer && (
                            <AnimatePresence mode="wait">
                                <motion.div key={selectedLayer.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>

                                    {/* Name */}
                                    <PropGroup label="Name">
                                        <PropInput value={selectedLayer.name} onChange={v => updateLayer(selectedId, { name: v })} />
                                    </PropGroup>

                                    {/* Position */}
                                    <PropGroup label="Position">
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <PropNumberInput label="X" value={Math.round(selectedLayer.x)} onChange={v => updateLayer(selectedId, { x: v })} />
                                            <PropNumberInput label="Y" value={Math.round(selectedLayer.y)} onChange={v => updateLayer(selectedId, { y: v })} />
                                        </div>
                                    </PropGroup>

                                    {/* Rotation */}
                                    <PropGroup label="Rotation">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input type="range" min={0} max={360} value={selectedLayer.rotation}
                                                onChange={e => updateLayer(selectedId, { rotation: Number(e.target.value) })}
                                                style={{ flex: 1, accentColor: ACCENT }} />
                                            <span style={{ fontSize: '11px', color: '#888', width: '36px', textAlign: 'right' }}>{selectedLayer.rotation}°</span>
                                        </div>
                                    </PropGroup>

                                    {/* Layer order */}
                                    <PropGroup label="Layer Order">
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <SmallBtn label="↑ Up" onClick={() => moveLayerUp(selectedId)} />
                                            <SmallBtn label="↓ Down" onClick={() => moveLayerDown(selectedId)} />
                                        </div>
                                    </PropGroup>

                                    {/* Text-specific */}
                                    {selectedLayer.type === 'text' && (
                                        <>
                                            <PropGroup label="Text Content">
                                                <PropInput value={selectedLayer.text} onChange={v => updateLayer(selectedId, { text: v })} multiline />
                                            </PropGroup>
                                            <PropGroup label="Font">
                                                <select value={selectedLayer.fontFamily}
                                                    onChange={e => updateLayer(selectedId, { fontFamily: e.target.value })}
                                                    style={{ ...selectStyle }}>
                                                    {['Inter', 'Arial', 'Georgia', 'Courier New', 'Verdana', 'Impact', 'Times New Roman', 'Comic Sans MS'].map(f =>
                                                        <option key={f} value={f}>{f}</option>
                                                    )}
                                                </select>
                                            </PropGroup>
                                            <PropGroup label="Font Size">
                                                <PropNumberInput value={selectedLayer.fontSize} onChange={v => updateLayer(selectedId, { fontSize: v })} />
                                            </PropGroup>
                                            <PropGroup label="Font Weight">
                                                <select value={selectedLayer.fontWeight}
                                                    onChange={e => updateLayer(selectedId, { fontWeight: e.target.value })}
                                                    style={{ ...selectStyle }}>
                                                    {['400', '500', '600', '700', '800', '900'].map(w =>
                                                        <option key={w} value={w}>{w}</option>
                                                    )}
                                                </select>
                                            </PropGroup>
                                            <PropGroup label="Color">
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input type="color" value={selectedLayer.fill}
                                                        onChange={e => updateLayer(selectedId, { fill: e.target.value })}
                                                        style={{ width: '36px', height: '36px', border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'transparent' }} />
                                                    <PropInput value={selectedLayer.fill} onChange={v => updateLayer(selectedId, { fill: v })} />
                                                </div>
                                            </PropGroup>
                                        </>
                                    )}

                                    {/* Image-specific */}
                                    {selectedLayer.type === 'image' && (
                                        <PropGroup label="Size">
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <PropNumberInput label="W" value={Math.round(selectedLayer.width)} onChange={v => updateLayer(selectedId, { width: v })} />
                                                <PropNumberInput label="H" value={Math.round(selectedLayer.height)} onChange={v => updateLayer(selectedId, { height: v })} />
                                            </div>
                                        </PropGroup>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        )}
                    </div>

                    {/* Info bar */}
                    {svgDims && (
                        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '10px', color: '#444', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{svgDims.widthMM.toFixed(1)} × {svgDims.heightMM.toFixed(1)} mm</span>
                            <span>{Math.round(svgDims.widthMM * MM_TO_PX)} × {Math.round(svgDims.heightMM * MM_TO_PX)} px</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ── Tiny UI components ── */
const ToolBtn = ({ icon, label, onClick, disabled, accent }) => (
    <button onClick={onClick} disabled={disabled}
        style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '10px',
            border: accent ? `1px solid ${ACCENT}` : '1px solid rgba(255,255,255,0.08)',
            backgroundColor: accent ? ACCENT_DIM : 'rgba(255,255,255,0.03)',
            color: disabled ? '#333' : accent ? '#c4b5fd' : '#ccc',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '11px', fontWeight: '700', transition: 'all 0.15s ease',
            opacity: disabled ? 0.4 : 1,
        }}>
        {icon}{label}
    </button>
);

const PropGroup = ({ label, children }) => (
    <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#555', display: 'block', marginBottom: '6px' }}>{label}</label>
        {children}
    </div>
);

const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)',
    color: '#fff', fontSize: '12px', outline: 'none', boxSizing: 'border-box',
};

const selectStyle = {
    ...inputStyle, cursor: 'pointer',
};

const PropInput = ({ value, onChange, multiline }) => {
    const Tag = multiline ? 'textarea' : 'input';
    return <Tag value={value} onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, ...(multiline ? { resize: 'vertical', minHeight: '60px' } : {}) }} />;
};

const PropNumberInput = ({ label, value, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {label && <span style={{ fontSize: '10px', color: '#555', fontWeight: '700' }}>{label}</span>}
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
            style={{ ...inputStyle, width: '100%' }} />
    </div>
);

const SmallBtn = ({ label, onClick }) => (
    <button onClick={onClick}
        style={{
            padding: '6px 12px', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: 'rgba(255,255,255,0.03)',
            color: '#aaa', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
        }}>{label}</button>
);

export default DesignStudioContainer;
