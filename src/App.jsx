import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Box as BoxIcon, Scissors, Image as ImageIcon, Sparkles, ChevronRight, LayoutGrid, PenTool } from 'lucide-react';
import ImageStudioContainer from './features/ImageStudio/ImageStudioContainer';
import SvgForgeContainer from './features/SvgForge/SvgForgeContainer';
import ProductContainer from './features/Product/ProductContainer';
import DesignStudioContainer from './features/DesignStudio/DesignStudioContainer';

const App = () => {
    const [view, setView] = useState('hub');

    const apps = [
        { id: 'image', name: 'Image Studio', desc: 'Precision Nesting & Extraction', icon: <ImageIcon size={32} />, color: '#6366f1', component: <ImageStudioContainer onBack={() => setView('hub')} /> },
        { id: 'svg', name: 'SVG Forge', desc: 'Precision CNC Tab Injection', icon: <BoxIcon size={32} />, color: '#10b981', component: <SvgForgeContainer onBack={() => setView('hub')} /> },
        { id: 'product', name: 'Products', desc: 'Inventory & Marketing Core', icon: <LayoutGrid size={32} />, color: '#f59e0b', component: <ProductContainer onBack={() => setView('hub')} /> },
        { id: 'design', name: 'Design Studio', desc: 'Layer Composer & SVG Editor', icon: <PenTool size={32} />, color: '#ec4899', component: <DesignStudioContainer onBack={() => setView('hub')} /> }
    ];

    if (view !== 'hub') {
        return apps.find(a => a.id === view).component;
    }

    return (
        <div className="hub-container" style={{ minHeight: '100vh', backgroundColor: '#050505', color: '#fff', padding: '40px' }}>
            <header style={{ marginBottom: '80px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <h1 style={{ fontSize: '32px', fontWeight: '900', letterSpacing: '-0.02em', fontStyle: 'italic' }}>LUMORA <span style={{ color: '#6366f1' }}>BACKBORN</span></h1>
                    <p style={{ color: '#555', marginTop: '10px', textTransform: 'uppercase', letterSpacing: '0.4em', fontSize: '10px' }}>Creative Core • CNC Production Hub</p>
                </motion.div>
                <div style={{ padding: '20px', borderRadius: '24px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <LayoutGrid size={24} style={{ opacity: 0.2 }} />
                </div>
            </header>

            <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px', maxWidth: '1400px', margin: '0 auto' }}>
                {apps.map((app, i) => (
                    <motion.div
                        key={app.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        whileHover={{ y: -10, backgroundColor: 'rgba(255,255,255,0.04)' }}
                        onClick={() => setView(app.id)}
                        style={{
                            padding: '60px',
                            borderRadius: '40px',
                            backgroundColor: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            cursor: 'pointer',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        <div style={{ color: app.color, marginBottom: '30px' }}>{app.icon}</div>
                        <h2 style={{ fontSize: '28px', fontWeight: '900', marginBottom: '15px' }}>{app.name}</h2>
                        <p style={{ color: '#555', fontSize: '14px', lineHeight: '1.6' }}>{app.desc}</p>
                        
                        <div style={{ marginTop: '40px', display: 'flex', alignItems: 'center', gap: '10px', color: app.color, fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Launch Core <ChevronRight size={16} />
                        </div>

                        {/* Aesthetic background glow */}
                        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '300px', height: '300px', background: `radial-gradient(circle, ${app.color}15 0%, transparent 70%)` }} />
                    </motion.div>
                ))}


            </main>
        </div>
    );
};

export default App;
