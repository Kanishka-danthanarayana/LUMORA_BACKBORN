import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NestingModule from '../Nesting/NestingModule';
import SplitterModule from '../Splitter/SplitterModule';
import SlotterModule from '../Slotter/SlotterModule';

const subTabs = [
    { key: 'nesting', label: 'Nesting' },
    { key: 'splitter', label: 'Splitter' },
    { key: 'slotter', label: 'Slot Cutter' },
];

const CNCToolsModule = () => {
    const [activeSubTab, setActiveSubTab] = useState('nesting');

    return (
        <div>
            {/* Sub-tab bar */}
            <div style={{
                display: 'flex',
                gap: '6px',
                marginBottom: '28px',
                padding: '6px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.06)',
                width: 'fit-content',
            }}>
                {subTabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveSubTab(tab.key)}
                        style={{
                            position: 'relative',
                            backgroundColor: activeSubTab === tab.key ? 'rgba(99,102,241,0.15)' : 'transparent',
                            border: activeSubTab === tab.key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                            padding: '10px 22px',
                            borderRadius: '12px',
                            color: activeSubTab === tab.key ? '#a5b4fc' : '#777',
                            cursor: 'pointer',
                            fontWeight: activeSubTab === tab.key ? '700' : '500',
                            fontSize: '13px',
                            letterSpacing: '0.02em',
                            transition: 'all 0.25s ease',
                        }}
                    >
                        {activeSubTab === tab.key && (
                            <motion.div
                                layoutId="subtab-indicator"
                                style={{
                                    position: 'absolute',
                                    bottom: '4px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: '18px',
                                    height: '2px',
                                    backgroundColor: '#6366f1',
                                    borderRadius: '2px',
                                }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Sub-tab content */}
            <AnimatePresence mode="wait">
                {activeSubTab === 'nesting' && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.2 }}
                        key="nesting-sub"
                    >
                        <NestingModule />
                    </motion.div>
                )}
                {activeSubTab === 'splitter' && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.2 }}
                        key="splitter-sub"
                    >
                        <SplitterModule />
                    </motion.div>
                )}
                {activeSubTab === 'slotter' && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.2 }}
                        key="slotter-sub"
                    >
                        <SlotterModule />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CNCToolsModule;
