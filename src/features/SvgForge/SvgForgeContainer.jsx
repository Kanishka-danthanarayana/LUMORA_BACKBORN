import React from 'react';
import { ChevronLeft } from 'lucide-react';
import TabInjectorModule from './TabInjector/TabInjectorModule';

const SvgForgeContainer = ({ onBack }) => {
    return (
        <div className="app-container" style={{ padding: '0 40px 40px 40px', backgroundColor: '#050505', minHeight: '100vh', color: '#fff' }}>
            <header style={{ padding: '40px 0', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <button onClick={onBack} style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px', borderRadius: '14px', cursor: 'pointer' }}><ChevronLeft /></button>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: '900', fontStyle: 'italic' }}>SVG FORGE <span style={{ color: '#10b981', fontStyle: 'normal', fontSize: '12px', verticalAlign: 'middle', marginLeft: '10px' }}>VECTOR PRECISION</span></h1>
                    <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4em', color: '#555', marginTop: '4px' }}>Tab Injection • Structural Profiling • Kerf Tuning</p>
                </div>
            </header>

            <main style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '40px', padding: '40px', minHeight: '600px' }}>
                <TabInjectorModule />
            </main>
        </div>
    );
};

export default SvgForgeContainer;
