import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CNCToolsModule from './CNCTools/CNCToolsModule';
import VectorizerModule from './Vectorizer/VectorizerModule';
import KeyTagsModule from './KeyTags/KeyTagsModule';

const ImageStudioContainer = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState('cnctools');

    return (
        <div className="app-container" style={{ padding: '0 40px 40px 40px', backgroundColor: '#050505', minHeight: '100vh', color: '#fff' }}>
            <header style={{ padding: '40px 0', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <button onClick={onBack} style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px', borderRadius: '14px', cursor: 'pointer' }}><ChevronLeft /></button>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: '900', fontStyle: 'italic' }}>IMAGE STUDIO <span style={{ color: '#6366f1', fontStyle: 'normal', fontSize: '12px', verticalAlign: 'middle', marginLeft: '10px' }}>CNC VISION</span></h1>
                    <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4em', color: '#555', marginTop: '4px' }}>Nesting • Splitting • Selective Extraction</p>
                </div>
            </header>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', justifyContent: 'center' }}>
                <button style={{ backgroundColor: activeTab === 'cnctools' ? '#6366f1' : 'rgba(255,255,255,0.02)', border: 'none', padding: '12px 24px', borderRadius: '14px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setActiveTab('cnctools')}>CNC Tools</button>
                <button style={{ backgroundColor: activeTab === 'vectorizer' ? '#6366f1' : 'rgba(255,255,255,0.02)', border: 'none', padding: '12px 24px', borderRadius: '14px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setActiveTab('vectorizer')}>Vectorizer</button>
                <button style={{ backgroundColor: activeTab === 'keytags' ? '#6366f1' : 'rgba(255,255,255,0.02)', border: 'none', padding: '12px 24px', borderRadius: '14px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setActiveTab('keytags')}>Key Tags</button>
            </div>

            <main style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '40px', padding: '40px', minHeight: '600px' }}>
                <AnimatePresence mode="wait">
                    {activeTab === 'cnctools' && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} key="cnctools">
                            <CNCToolsModule />
                        </motion.div>
                    )}
                    {activeTab === 'vectorizer' && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} key="vectorizer">
                            <VectorizerModule />
                        </motion.div>
                    )}
                    {activeTab === 'keytags' && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} key="keytags">
                            <KeyTagsModule />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
            <style dangerouslySetInnerHTML={{ __html: `
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .boards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem; padding: 1rem 0; overflow-y: auto; max-height: 500px; }
                .board-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 15px; transition: 0.3s; display: flex; flex-direction: column; }
                .board-card:hover { border-color: #6366f1; transform: translateY(-4px); }
                .btn-primary { background-color: #6366f1; color: #fff; border: none; cursor: pointer; transition: 0.3s; }
                .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
            ` }} />
        </div>
    );
};

export default ImageStudioContainer;
