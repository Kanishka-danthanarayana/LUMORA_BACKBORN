import React, { useState, useRef } from 'react';
import { Upload, Download, Play, RefreshCw, X, ZoomIn, ZoomOut, Maximize2, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

const TabInjectorModule = () => {
    const [svgContent, setSvgContent] = useState(null);
    const [minDistance, setMinDistance] = useState(25);
    const [maxTabs, setMaxTabs] = useState(2);
    const [tabLength, setTabLength] = useState(0.5);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedSvg, setProcessedSvg] = useState(null);
    const [activeModal, setActiveModal] = useState(null);
    const fileInputRef = useRef(null);

    // MASTER GEOMETRY ENGINE: Path Curvature & Structural Analysis
    const getStructuralProfile = (tempPath, totalLength, scale) => {
        const step = Math.max(0.2 * scale, 0.05); const prof = []; const delta = 0.5 * scale;
        for (let l = 0; l <= totalLength; l += step) {
            const p1 = tempPath.getPointAtLength((l - delta + totalLength) % totalLength); const p2 = tempPath.getPointAtLength(l % totalLength); const p3 = tempPath.getPointAtLength((l + delta) % totalLength);
            const v1 = { x: p2.x - p1.x, y: p2.y - p1.y }; const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
            const m1 = Math.sqrt(v1.x*v1.x+v1.y*v1.y); const m2 = Math.sqrt(v2.x*v2.x+v2.y*v2.y);
            if (m1 < 0.0001 || m2 < 0.0001) { prof.push({ l, f: 0 }); continue; }
            prof.push({ l, f: Math.max(0, (v1.x*v2.x+v1.y*v2.y)/(m1*m2)) });
        }
        return prof.map((d, i) => {
            let rs = i; let re = i; const th = 0.99;
            while (prof[(rs-1+prof.length)%prof.length].f > th) { rs = (rs-1+prof.length)%prof.length; if (rs === i) break; }
            while (prof[(re+1)%prof.length].f > th) { re = (re+1)%prof.length; if (re === i) break; }
            const rC = (re>=rs)?(re-rs+1):(prof.length-rs+re+1); const mid = (re>=rs)?(rs+re)/2:(rs+(rs+rC)/2)%prof.length;
            const dC = Math.min(Math.abs(i-mid), prof.length-Math.abs(i-mid)); const cF = 1.0/(1.0+(dC*step/scale));
            return Math.pow(d.f, 15) * (rC*step/scale) * cF;
        });
    };

    const processSVG = async () => {
        if (!svgContent) return;
        setIsProcessing(true); await new Promise(r => setTimeout(r, 1200));
        try {
            const parser = new DOMParser(); const doc = parser.parseFromString(svgContent, 'image/svg+xml'); const svgRoot = doc.querySelector('svg');
            let scale = 1; const wAt = svgRoot.getAttribute('width'); const vAt = svgRoot.getAttribute('viewBox');
            if (wAt && wAt.includes('mm') && vAt) { const mmW = parseFloat(wAt); const vbW = parseFloat(vAt.split(/[ ,]+/)[2]); if (!isNaN(mmW) && !isNaN(vbW)) scale = vbW / mmW; }
            const mDU = minDistance * scale; const tWU = tabLength * scale; const hSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            hSvg.style.position = 'absolute'; hSvg.style.visibility = 'hidden'; document.body.appendChild(hSvg);
            let bLs = doc.querySelectorAll('#visual-tabs-layer'); bLs.forEach(l => l.remove());
            const tabG = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); tabG.setAttribute('id', 'visual-tabs-layer'); svgRoot.appendChild(tabG);
            const els = svgRoot.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon');
            for (const el of els) {
                if (el.id==='visual-tabs-layer' || el.closest('#visual-tabs-layer')) continue;
                let dD = ''; const tag = el.tagName.toLowerCase();
                if (tag === 'path') dD = el.getAttribute('d');
                else if (tag === 'rect') { const w = parseFloat(el.getAttribute('width') || 0); const h = parseFloat(el.getAttribute('height') || 0); const x = parseFloat(el.getAttribute('x') || 0); const y = parseFloat(el.getAttribute('y') || 0); dD = `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`; }
                else if (tag === 'circle' || tag === 'ellipse') { const rx = parseFloat(el.getAttribute('rx') || el.getAttribute('r') || 0); const ry = parseFloat(el.getAttribute('ry') || el.getAttribute('r') || 0); const cx = parseFloat(el.getAttribute('cx') || 0); const cy = parseFloat(el.getAttribute('cy') || 0); dD = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`; }
                if (!dD) continue;
                const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tmp.setAttribute('d', dD); hSvg.appendChild(tmp);
                const tL = tmp.getTotalLength(); if (tL < 0.1) { hSvg.removeChild(tmp); continue; }
                let nT = maxTabs; while (nT > 1 && (tL / nT) < mDU) nT--;
                const prof = getStructuralProfile(tmp, tL, scale); const res = prof.length; const sS = tL/res;
                let bO = 0; let mF = -1; for (let i = 0; i < res / nT; i++) { let cF = 0; for (let t = 0; t < nT; t++) cF += prof[Math.floor(i + (t * res / nT)) % res]; if (cF > mF) { mF = cF; bO = i * sS; } }
                const tCs = []; for (let t = 0; t < nT; t++) tCs.push((bO + (t * tL / nT)) % tL); tCs.sort((a,b)=>a-b);
                let nD = ''; let tD = ''; let cur = 0; const step = 0.05 * scale;
                for (let c of tCs) {
                    const s = c - (tWU / 2); const e = c + (tWU / 2);
                    if (cur < s) { const endC = Math.max(cur, Math.min(s, tL)); const pS = tmp.getPointAtLength(cur); nD += ` M ${pS.x} ${pS.y}`; for (let l = cur + step; l < endC; l += step) { const p = tmp.getPointAtLength(l); nD += ` L ${p.x} ${p.y}`; } const pE = tmp.getPointAtLength(endC); nD += ` L ${pE.x} ${pE.y}`; }
                    const aS = Math.max(0, Math.min(s, tL)); const aE = Math.min(e, tL); if (aS < aE) { const ptS = tmp.getPointAtLength(aS); tD += ` M ${ptS.x} ${ptS.y}`; for (let l = aS + step; l < aE; l += step) { const p = tmp.getPointAtLength(l); tD += ` L ${p.x} ${p.y}`; } const ptE = tmp.getPointAtLength(aE); tD += ` L ${ptE.x} ${ptE.y}`; }
                    cur = e;
                }
                if (cur < tL) { const pS = tmp.getPointAtLength(cur); nD += ` M ${pS.x} ${pS.y}`; for (let l = cur + step; l <= tL; l += step) { const p = tmp.getPointAtLength(l); nD += ` L ${p.x} ${p.y}`; } const pE = tmp.getPointAtLength(tL); nD += ` L ${pE.x} ${pE.y}`; }
                el.setAttribute('d', nD);
                const vP = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); vP.setAttribute('d', tD); vP.setAttribute('stroke', '#00ff00'); vP.setAttribute('stroke-width', ((parseFloat(el.getAttribute('stroke-width')) || 0.2) * 2) + (el.getAttribute('stroke-width')?.includes('mm')?'mm':'')); vP.setAttribute('fill', 'none'); vP.setAttribute('stroke-linecap', 'butt'); vP.setAttribute('class', 'tab-bridge'); tabG.appendChild(vP); hSvg.removeChild(tmp);
            }
            document.body.removeChild(hSvg); setProcessedSvg(new XMLSerializer().serializeToString(doc));
        } catch (err) { } finally { setIsProcessing(false); }
    };

    const handleFileUpload = (e) => {
        const f = e.target.files?.[0] || e.dataTransfer?.files?.[0]; if (f) { const r = new FileReader(); r.onload = (ev) => { setSvgContent(ev.target.result); setProcessedSvg(null); }; r.readAsText(f); }
    };

    const boxStyle = { flex: 1, backgroundColor: '#0a0a0a', border: '2px solid rgba(255,255,255,0.05)', borderRadius: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' };
    const labelStyle = { fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.4em', color: '#555', marginBottom: '16px' };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px 1fr', gap: '40px', width: '100%', minHeight: '70vh' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={labelStyle}>01. SOURCE PANEL</div>
                <div style={boxStyle} onClick={() => !svgContent && fileInputRef.current.click()} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault(); handleFileUpload(e);}}>
                    {svgContent ? <div style={{ width: '100%', height: '100%', padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="thumbnails-svg-wrapper" dangerouslySetInnerHTML={{ __html: svgContent }} /> : <div style={{ opacity: 0.2, textAlign: 'center' }}><Upload size={48} style={{ marginBottom: '16px' }} /><p style={{ fontSize: '10px', fontWeight: '900', letterSpacing: '0.2em' }}>DRAG SVG HERE</p></div>}
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".svg" onChange={handleFileUpload} />
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '48px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '48px', padding: '40px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '900', color: '#6366f1' }}><span>TABS</span><span>{maxTabs}</span></div><input type="range" min="1" max="10" value={maxTabs} onChange={(e)=>setMaxTabs(Number(e.target.value))} style={{ width: '100%', height: '4px', accentColor: '#6366f1' }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '900', color: '#6366f1' }}><span>GAP (MM)</span><span>{minDistance}</span></div><input type="range" min="5" max="100" value={minDistance} onChange={(e)=>setMinDistance(Number(e.target.value))} style={{ width: '100%', height: '4px', accentColor: '#6366f1' }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '900', color: '#6366f1' }}><span>WIDTH (MM)</span><span>{tabLength}</span></div><input type="range" min="0.1" max="5" step="0.1" value={tabLength} onChange={(e)=>setTabLength(Number(e.target.value))} style={{ width: '100%', height: '4px', accentColor: '#6366f1' }} /></div>
                </div>
                <button disabled={!svgContent || isProcessing} onClick={processSVG} style={{ padding: '24px', backgroundColor: (!svgContent || isProcessing) ? 'rgba(255,255,255,0.05)' : '#6366f1', color: (!svgContent || isProcessing) ? '#444' : '#fff', borderRadius: '32px', border: 'none', fontWeight: '900', fontSize: '10px', letterSpacing: '0.3em', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} {isProcessing ? "PROCESSING" : "INJECT TABS"}
                </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={labelStyle}>02. RESULT PANEL</div>
                <div style={boxStyle}>
                    {processedSvg ? <div style={{ width: '100%', height: '100%', padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="thumbnails-svg-wrapper" dangerouslySetInnerHTML={{ __html: processedSvg }} /> : <div style={{ opacity: 0.05 }}><Zap size={64} /></div>}
                    <AnimatePresence>
                        {processedSvg && (
                            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ position: 'absolute', bottom: '32px', display: 'flex', gap: '12px' }}>
                                <button onClick={() => setActiveModal('result')} style={{ padding: '14px 24px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '9px', fontWeight: '900', letterSpacing: '0.1em', backdropFilter: 'blur(10px)' }}>SHOW</button>
                                <button onClick={() => { const parser = new DOMParser(); const doc = parser.parseFromString(processedSvg, 'image/svg+xml'); doc.getElementById('visual-tabs-layer')?.remove(); const b = new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'CLEAN_DESIGN.svg'; a.click(); }} style={{ padding: '14px 24px', backgroundColor: '#10b981', color: '#000', borderRadius: '32px', border: 'none', cursor: 'pointer', fontSize: '9px', fontWeight: '900', letterSpacing: '0.1em' }}>DOWNLOAD</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <AnimatePresence>
                {activeModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.98)', padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '64px', overflow: 'hidden' }}>
                            <button onClick={()=>setActiveModal(null)} style={{ position: 'absolute', top: '32px', right: '32px', zIndex: 9999, padding: '20px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '100%', border: 'none', cursor: 'pointer' }}><X size={24}/></button>
                            <TransformWrapper initialScale={1} minScale={0.15} maxScale={80} centerOnInit wheel={{ activationKeys: ["Control"], step: 0.1 }}>
                                {({ zoomIn, zoomOut, resetTransform }) => (
                                    <>
                                        <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.8)', padding: '12px 32px', borderRadius: '100px', display: 'flex', gap: '32px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <button onClick={()=>zoomIn()} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><ZoomIn size={20}/></button>
                                            <button onClick={()=>zoomOut()} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><ZoomOut size={20}/></button>
                                            <button onClick={()=>resetTransform()} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><Maximize2 size={20}/></button>
                                        </div>
                                        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: processedSvg }} />
                                        </TransformComponent>
                                    </>
                                )}
                            </TransformWrapper>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <style dangerouslySetInnerHTML={{ __html: `
                #visual-tabs-layer path { stroke: #00ff00 !important; }
                .thumbnails-svg-wrapper svg { width: auto; height: auto; max-width: 90%; max-height: 90%; display: block; margin: auto; }
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}} />
        </div>
    );
};

export default TabInjectorModule;
