import React, { useState, useRef } from 'react';
import { Upload, Download, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

const SlotterModule = () => {
    const [slotImage, setSlotImage] = useState(null);
    const [slotRealWidth, setSlotRealWidth] = useState(100);
    const [slotThickness, setSlotThickness] = useState(5);
    const [slotLength, setSlotLength] = useState(50);
    const [slotGap, setSlotGap] = useState(3);
    const [slotPosX, setSlotPosX] = useState(0.5);
    const [slotPosY, setSlotPosY] = useState(0.5);
    const [slotAngle, setSlotAngle] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const slotInputRef = useRef(null);

    const loadImage = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => setSlotImage(e.target.result);
        reader.readAsDataURL(file);
    };

    const processSlotter = async () => {
        if (!slotImage) return;
        setIsProcessing(true);
        try {
            const img = new Image(); img.src = slotImage; await img.decode();
            const W = img.naturalWidth, H = img.naturalHeight;
            const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
            const pixelsPerMM = W / slotRealWidth, gapPx = slotGap * pixelsPerMM, thickPx = slotThickness * pixelsPerMM, lenPx = slotLength * pixelsPerMM;
            ctx.save(); ctx.translate(W * slotPosX, H * slotPosY); ctx.rotate((slotAngle * Math.PI) / 180); ctx.fillStyle = '#000000';
            ctx.fillRect(-(gapPx/2) - thickPx, -lenPx/2, thickPx, lenPx); ctx.fillRect(gapPx/2, -lenPx/2, thickPx, lenPx); ctx.restore();
            const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'slotted_output.png'; a.click();
        } catch(e) { console.error(e); } finally { setIsProcessing(false); }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '40px' }}>
            <div style={{ backgroundColor: '#000', borderRadius: '32px', border: '1px solid #222', minHeight: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                {!slotImage ? (
                    <div onClick={() => slotInputRef.current.click()} style={{ cursor: 'pointer', textAlign: 'center', opacity: 0.2 }}>
                        <Upload size={48} />
                        <p style={{ marginTop: '10px', fontWeight: 'bold' }}>DRAG TARGET IMAGE</p>
                    </div>
                ) : (
                    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                        <img src={slotImage} style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable="false" />
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                            <div style={{
                                position: 'absolute',
                                left: `${slotPosX * 100}%`, top: `${slotPosY * 100}%`,
                                transform: `translate(-50%, -50%) rotate(${slotAngle}deg)`,
                                display: 'flex', gap: `${Math.max(4, slotGap * (400 / slotRealWidth))}px`,
                                pointerEvents: 'auto', cursor: 'move', padding: '40px'
                            }}
                                onMouseDown={(e) => {
                                    e.preventDefault(); const startX = e.clientX, startY = e.clientY; const startPx = slotPosX, startPy = slotPosY;
                                    const box = e.currentTarget.parentElement.getBoundingClientRect();
                                    const onMove = ev => {
                                        setSlotPosX(Math.max(0, Math.min(1, startPx + (ev.clientX - startX) / box.width)));
                                        setSlotPosY(Math.max(0, Math.min(1, startPy + (ev.clientY - startY) / box.height)));
                                    };
                                    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                                    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
                                }}>
                                <div style={{ backgroundColor: '#00ff00', width: `${slotThickness * (400 / slotRealWidth)}px`, height: `${slotLength * (400 / slotRealWidth)}px`, boxShadow: '0 0 10px #00ff00' }} />
                                <div style={{ backgroundColor: '#00ff00', width: `${slotThickness * (400 / slotRealWidth)}px`, height: `${slotLength * (400 / slotRealWidth)}px`, boxShadow: '0 0 10px #00ff00' }} />
                            </div>
                        </div>
                    </div>
                )}
                <input ref={slotInputRef} type="file" hidden onChange={e => loadImage(e.target.files[0])} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="preview-box">
                    <p style={{ fontSize: '10px', color: '#6366f1', fontWeight: '900', marginBottom: '10px' }}>PHYSICAL WIDTH (MM)</p>
                    <input type="number" value={slotRealWidth} onChange={e => setSlotRealWidth(parseFloat(e.target.value) || 1)} style={{ backgroundColor: '#000', border: '1px solid #222', color: '#fff', padding: '12px', borderRadius: '12px', width: '100%' }} />
                </div>
                <div className="preview-box" style={{ gap: '15px' }}>
                    <p style={{ fontSize: '10px', color: '#6366f1', fontWeight: '900' }}>PRECISION CALIBRATION</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#555' }}><span>Length: {slotLength}mm</span></div>
                    <input type="range" min="10" max="500" value={slotLength} onChange={e => setSlotLength(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#555' }}><span>Gap: {slotGap}mm</span></div>
                    <input type="range" min="1" max="100" value={slotGap} onChange={e => setSlotGap(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#555' }}><span>Thickness: {slotThickness}mm</span></div>
                    <input type="range" min="1" max="50" value={slotThickness} onChange={e => setSlotThickness(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#555' }}><span>Angle: {slotAngle}°</span></div>
                    <input type="range" min="0" max="360" value={slotAngle} onChange={e => setSlotAngle(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                </div>
                <button onClick={processSlotter} disabled={!slotImage || isProcessing} className="btn-primary" style={{ padding: '20px', borderRadius: '20px', fontWeight: 'bold' }}>
                    {isProcessing ? "PROCESSING..." : "GENERATE CNC SLOT"}
                </button>
            </div>
        </div>
    );
};

export default SlotterModule;
