import React, { useState, useRef } from 'react';
import { Upload, Download, RotateCcw, Scissors } from 'lucide-react';
import { motion } from 'framer-motion';

const SplitterModule = () => {
    const [splitSourceUrl, setSplitSourceUrl] = useState(null);
    const [splitPreviewUrl, setSplitPreviewUrl] = useState(null);
    const [splitResults, setSplitResults] = useState([]);
    const [isSplitting, setIsSplitting] = useState(false);
    const [splitBlackAndWhite, setSplitBlackAndWhite] = useState(false);
    const splitInputRef = useRef(null);

    const loadImage = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            setSplitSourceUrl(e.target.result);
            setSplitResults([]);
            setSplitPreviewUrl(null);
        };
        reader.readAsDataURL(file);
    };

    const processSplitting = async () => {
        if (!splitSourceUrl) return;
        setIsSplitting(true);
        try {
            const img = new Image(); img.src = splitSourceUrl; await img.decode();
            const W = img.naturalWidth, H = img.naturalHeight;
            const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, W, H).data;
            
            // Background Sampling
            const testPts = [ [10, 10], [W/2, 10], [W-11, 10], [10, H/2], [W-11, H/2], [10, H-11], [W/2, H-11], [W-11, H-11] ];
            const samples = []; testPts.forEach(([x,y]) => { const cx = Math.floor(x), cy = Math.floor(y); if (cx>=0 && cx<W && cy>=0 && cy<H) { const i = (cy*W + cx)*4; if (data[i+3] > 200) samples.push({r: data[i], g: data[i+1], b: data[i+2]}); } });
            let bg = {r: 255, g: 255, b: 255}; let maxCount = -1;
            samples.forEach(s => { let count = 0; samples.forEach(o => { if (Math.abs(s.r-o.r)+Math.abs(s.g-o.g)+Math.abs(s.b-o.b) < 20) count++; }); if (count > maxCount) { maxCount = count; bg = s; } });

            const isForeground = new Uint8Array(W * H);
            for (let i = 0; i < data.length; i += 4) {
                const diff = Math.abs(data[i]-bg.r) + Math.abs(data[i+1]-bg.g) + Math.abs(data[i+2]-bg.b);
                if (diff > 30 && data[i+3] > 10) isForeground[i/4] = 1;
            }

            // Object Detection BFS
            const visited = new Uint8Array(W * H); let rawBBoxes = []; const q = new Uint32Array(W * H);
            for(let y=0; y<H; y++){
                for(let x=0; x<W; x++){
                    const idx = y*W + x;
                    if(isForeground[idx] && !visited[idx]) {
                        let minX=x, maxX=x, minY=y, maxY=y; let head = 0, tail = 0; q[tail++] = idx; visited[idx] = 1;
                        while(head < tail) {
                            const curr = q[head++]; const cy = Math.floor(curr / W); const cx = curr % W;
                            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
                            for(let ny = Math.max(0, cy-1); ny <= Math.min(H-1, cy+1); ny++){
                                for(let nx = Math.max(0, cx-1); nx <= Math.min(W-1, cx+1); nx++){
                                    const nidx = ny*W + nx; if(isForeground[nidx] && !visited[nidx]) { visited[nidx] = 1; q[tail++] = nidx; }
                                }
                            }
                        }
                        if ((maxX - minX) > 5 || (maxY - minY) > 5) rawBBoxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
                    }
                }
            }
            
            // Merging logic
            let merged = true; while (merged) { merged = false; for (let i = 0; i < rawBBoxes.length; i++) { for (let j = i + 1; j < rawBBoxes.length; j++) { const b1 = rawBBoxes[i], b2 = rawBBoxes[j]; const overlapX = b1.x <= b2.x + b2.w && b1.x + b1.w >= b2.x; const overlapY = b1.y <= b2.y + b2.h && b1.y + b1.h >= b2.y; if (overlapX && overlapY) { const newX = Math.min(b1.x, b2.x), newY = Math.min(b1.y, b2.y), newMaxX = Math.max(b1.x + b1.w, b2.x + b2.w), newMaxY = Math.max(b1.y + b1.h, b2.y + b2.h); rawBBoxes[i] = { x: newX, y: newY, w: newMaxX - newX, h: newMaxY - newY }; rawBBoxes.splice(j, 1); merged = true; break; } } if (merged) break; } }
            
            const results = [];
            rawBBoxes.filter(b => b.w > 20 && b.h > 20).forEach((b, idx) => {
                const outC = document.createElement('canvas'); outC.width = b.w+20; outC.height = b.h+20;
                const outCtx = outC.getContext('2d'); outCtx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`; outCtx.fillRect(0,0,b.w+20,b.h+20);
                outCtx.drawImage(img, b.x, b.y, b.w, b.h, 10, 10, b.w, b.h);
                results.push(outC.toDataURL('image/png'));
            });

            const pC = document.createElement('canvas'); pC.width = W; pC.height = H; const pCtx = pC.getContext('2d'); pCtx.drawImage(img, 0,0); pCtx.strokeStyle = '#00ff00'; pCtx.lineWidth=3; rawBBoxes.forEach(b => pCtx.strokeRect(b.x, b.y, b.w, b.h));
            setSplitPreviewUrl(pC.toDataURL('image/png')); setSplitResults(results);
        } catch(e) { console.error(e); } finally { setIsSplitting(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ height: '300px', backgroundColor: '#000', borderRadius: '32px', border: '2px dashed rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }} onClick={()=>splitInputRef.current.click()}>
                {!splitSourceUrl ? <div style={{ textAlign: 'center', opacity: 0.1 }}><Upload size={48}/><p style={{ fontWeight: 'bold', marginTop: '10px' }}>DROP MULTI-DESIGN SHEET</p></div> : <img src={splitPreviewUrl || splitSourceUrl} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}/>}
                <input ref={splitInputRef} type="file" hidden onChange={e=>loadImage(e.target.files[0])}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center' }}>
                <button onClick={processSplitting} disabled={!splitSourceUrl || isSplitting} className="btn-primary" style={{ padding: '20px 40px', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {isSplitting ? <RotateCcw className="spin" size={18}/> : <Scissors size={18}/>}
                    {isSplitting ? "SCANNING..." : "DETECT & SPLIT"}
                </button>
            </div>
            <div className="boards-grid">
                {splitResults.map((url, i) => (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} key={i} className="board-card">
                        <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: '14px', marginBottom: '15px', overflow: 'hidden' }}><img src={url} style={{ maxHeight: '100%', maxWidth: '100%' }}/></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#333' }}>PART {i+1}</span>
                            <button onClick={()=>{const a=document.createElement('a'); a.href=url; a.download=`Split_${i+1}.png`; a.click();}} style={{ backgroundColor: '#6366f1', border: 'none', color: '#fff', padding: '10px', borderRadius: '10px', cursor: 'pointer' }}><Download size={14}/></button>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default SplitterModule;
