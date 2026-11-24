import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Folder, Package, ChevronLeft, Plus, Trash2, Edit3, 
    LayoutGrid, Info, Image as ImageIcon, 
    FileCode, BarChart3, AlertCircle, CheckCircle2, Loader2, X, Save, Clock, Ruler, Upload,
    ChevronRight, FileText, Download, ExternalLink, MoreHorizontal
} from 'lucide-react';

const ProductContainer = ({ onBack }) => {
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [productData, setProductData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);
    const assetInputRef = useRef(null);

    // Modal State
    const [modal, setModal] = useState({ 
        show: false, 
        type: '', 
        category: '', 
        title: '', 
        name: '',
        info: { name: '', h: '', w: '', l: '', unit: 'mm', hrs: '', mins: '', materialCost: '', unitPrice: '' },
        assets: [],
        folder: ''
    });

    // --- API Operations ---

    const loadInventory = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/products');
            const data = await response.json();
            
            const categoryList = data.filter(item => item.kind === 'directory').map(cat => ({
                name: cat.name,
                products: cat.children.filter(c => c.kind === 'directory' && c.name !== 'Marketing').map(prod => ({
                    name: prod.name,
                    children: prod.children
                }))
            }));
            
            setCategories(categoryList);
        } catch (err) {
            console.error(err);
            setError("Failed to load inventory.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadInventory();
    }, []);

    const selectProduct = (catName, prod) => {
        setSelectedCategory(catName);
        setSelectedProduct(prod);
        
        const marketingFolder = prod.children.find(c => c.name === 'Marketing');
        const marketing = marketingFolder?.info || { name: prod.name, size: '', timeToComplete: '', materialCost: '', unitPrice: '' };
        
        const imageFolder = prod.children.find(c => c.name === 'Product images');
        const images = imageFolder?.children.filter(c => c.kind === 'file' && /\.(jpe?g|png|webp|gif)$/i.test(c.name)) || [];
        
        const svgFolder = prod.children.find(c => c.name === 'Design_SVGs');
        const svgs = svgFolder?.children.filter(c => c.kind === 'file') || [];
        
        const designImgFolder = prod.children.find(c => c.name === 'Design_Images');
        const designImages = designImgFolder?.children.filter(c => c.kind === 'file') || [];
        
        const setupFolder = prod.children.find(c => c.name === 'Setup');
        const setupPdfs = setupFolder?.children.filter(c => c.kind === 'file') || [];
        
        const otherFolder = prod.children.find(c => c.name === 'Other');
        const otherAssets = otherFolder?.children.filter(c => c.kind === 'file') || [];

        setProductData({
            name: prod.name,
            marketing,
            images,
            svgs,
            designImages,
            setupPdfs,
            otherAssets
        });
    };

    const uploadAsset = async (file, targetFolder = 'Product images') => {
        if (!selectedProduct || !selectedCategory) return;
        setIsLoading(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                const response = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        type: 'upload', 
                        category: selectedCategory, 
                        name: selectedProduct.name, 
                        fileName: file.name,
                        folder: targetFolder,
                        base64 
                    })
                });
                if (response.ok) {
                    await loadInventory();
                    const newInventory = await (await fetch('/api/products')).json();
                    const cat = newInventory.find(c => c.name === selectedCategory);
                    const prod = cat.children.find(p => p.name === selectedProduct.name);
                    selectProduct(selectedCategory, prod);
                    
                    // Update modal assets list
                    if (modal.show && modal.type === 'viewAssets') {
                        const folder = prod.children.find(c => c.name === targetFolder);
                        const assets = folder?.children.filter(c => c.kind === 'file') || [];
                        setModal(m => ({ ...m, assets }));
                    }
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            alert("Upload failed.");
        } finally {
            setIsLoading(false);
        }
    };

    const deleteAsset = async (fileName, targetFolder = 'Product images') => {
        if (!fileName) return;
        if (!confirm(`Permanently delete "${fileName}" from ${targetFolder}?`)) return;
        setIsLoading(true);
        try {
            const response = await fetch(`/api/products?category=${selectedCategory}&name=${selectedProduct.name}&fileName=${encodeURIComponent(fileName)}&folder=${targetFolder}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await loadInventory();
                const newInventory = await (await fetch('/api/products')).json();
                const cat = newInventory.find(c => c.name === selectedCategory);
                const prod = cat.children.find(p => p.name === selectedProduct.name);
                selectProduct(selectedCategory, prod);
                
                // Update modal assets list
                if (modal.show && modal.type === 'viewAssets') {
                    const folder = prod.children.find(c => c.name === targetFolder);
                    const assets = folder?.children.filter(c => c.kind === 'file') || [];
                    setModal(m => ({ ...m, assets }));
                }
            }
        } catch (err) {
            alert("Delete failed.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = async () => {
        const { type, category, name, info } = modal;
        setIsLoading(true);
        try {
            let response;
            if (type === 'addCategory') {
                if (!name) return;
                response = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: name })
                });
            } else if (type === 'addProduct') {
                if (!name) return;
                response = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, name })
                });
            } else if (type === 'editCategory') {
                if (!name) return;
                response = await fetch('/api/products', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'renameCategory', oldName: category, newName: name })
                });
            } else if (type === 'editDetails') {
                const stripCurrency = (val) => val.toString().replace(/Rs\.|\$| /g, '');
                const finalInfo = {
                    name: info.name,
                    size: `${info.h} x ${info.w} x ${info.l} ${info.unit}`,
                    timeToComplete: `${info.hrs}h ${info.mins}m`,
                    materialCost: `Rs. ${stripCurrency(info.materialCost)}`,
                    unitPrice: `Rs. ${stripCurrency(info.unitPrice)}`
                };

                response = await fetch('/api/products', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: selectedCategory, name: selectedProduct.name, info: finalInfo })
                });
            }

            const res = await response.json();
            if (response.ok) {
                await loadInventory();
                if (type === 'editDetails' || type === 'editCategory') {
                    const newInventory = await (await fetch('/api/products')).json();
                    if (type === 'editCategory' && selectedCategory === category) {
                        setSelectedCategory(name);
                    }
                    const activeCat = type === 'editCategory' && selectedCategory === category ? name : selectedCategory;
                    
                    if (activeCat && selectedProduct) {
                        const cat = newInventory.find(c => c.name === activeCat);
                        if (cat) {
                            const targetProdName = type === 'editDetails' ? (res.newName || selectedProduct.name) : selectedProduct.name;
                            const prod = cat.children.find(p => p.name === targetProdName);
                            if (prod) selectProduct(activeCat, prod);
                        }
                    }
                }
                setModal({ show: false, type: '', category: '', title: '', name: '', info: {}, assets: [], folder: '' });
            } else {
                alert("Error: " + (res.error || "Unknown error"));
            }
        } catch (err) {
            alert("Network Error.");
        } finally {
            setIsLoading(false);
        }
    };

    const openEditModal = () => {
        const m = productData.marketing;
        let h = '', w = '', l = '', unit = 'mm';
        if (m.size) {
            const parts = m.size.trim().split(' ');
            unit = parts[parts.length - 1] || 'mm';
            const dims = m.size.replace(unit, '').split('x').map(s => s.trim());
            h = dims[0] || '';
            w = dims[1] || '';
            l = dims[2] || '';
        }
        let hrs = '', mins = '';
        if (m.timeToComplete) {
            const hMatch = m.timeToComplete.match(/(\d+)h/);
            const mMatch = m.timeToComplete.match(/(\d+)m/);
            hrs = hMatch ? hMatch[1] : '';
            mins = mMatch ? mMatch[1] : '';
        }

        setModal({
            show: true,
            type: 'editDetails',
            category: selectedCategory,
            title: 'Edit Product Details',
            name: productData.name,
            info: {
                name: m.name || productData.name,
                h, w, l, unit,
                hrs, mins,
                materialCost: (m.materialCost || '').replace(/Rs\.|\$| /g, ''),
                unitPrice: (m.unitPrice || '').replace(/Rs\.|\$| /g, '')
            }
        });
    };

    const deleteProduct = async (categoryName, productName) => {
        if (!confirm(`CRITICAL: This will delete the entire product "${productName}" and all its files. Proceed?`)) return;
        setIsLoading(true);
        try {
            const response = await fetch(`/api/products?category=${categoryName}&name=${productName}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await loadInventory();
                setSelectedProduct(null);
                setProductData(null);
            }
        } catch (err) {
            alert("Error deleting product.");
        } finally {
            setIsLoading(false);
        }
    };

    const deleteCategory = async (categoryName) => {
        if (!confirm(`CRITICAL: This will delete the entire category "${categoryName}" and ALL products inside it. Proceed?`)) return;
        setIsLoading(true);
        try {
            const response = await fetch(`/api/products?category=${categoryName}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await loadInventory();
                if (selectedCategory === categoryName) {
                    setSelectedProduct(null);
                    setProductData(null);
                    setSelectedCategory(null);
                }
            }
        } catch (err) {
            alert("Error deleting category.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="product-studio-root" style={{ display: 'flex', height: '100vh', backgroundColor: '#050505', color: '#fff', position: 'relative' }}>
            {/* Sidebar */}
            <aside style={{ width: '320px', borderRight: '1px solid #111', display: 'flex', flexDirection: 'column', background: '#080808' }}>
                <header style={{ padding: '30px', borderBottom: '1px solid #111' }}>
                    <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#666', cursor: 'pointer', marginBottom: '20px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                        <ChevronLeft size={16} /> Back to Hub
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: '900' }}>Inventory</h2>
                </header>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    {categories.map(cat => (
                        <div key={cat.name} style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f59e0b', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    <Folder size={14} /> {cat.name}
                                </div>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <button onClick={() => setModal({ show: true, type: 'editCategory', category: cat.name, title: 'Rename Category', name: cat.name, info: {} })} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Rename Category"><Edit3 size={12} /></button>
                                    <button onClick={() => deleteCategory(cat.name)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete Category"><Trash2 size={12} /></button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {cat.products.map(prod => (
                                    <div 
                                        key={prod.name}
                                        onClick={() => selectProduct(cat.name, prod)}
                                        style={{ 
                                            padding: '12px 15px', 
                                            borderRadius: '12px', 
                                            backgroundColor: selectedProduct?.name === prod.name ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                            color: selectedProduct?.name === prod.name ? '#f59e0b' : '#888',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            transition: '0.2s all'
                                        }}
                                    >
                                        <Package size={16} /> {prod.name}
                                    </div>
                                ))}
                                <button 
                                    onClick={() => setModal({ show: true, type: 'addProduct', category: cat.name, title: `Add Product to ${cat.name}`, name: '', info: {} })}
                                    style={{ padding: '10px', borderRadius: '10px', border: '1px dashed #222', background: 'transparent', color: '#444', fontSize: '12px', cursor: 'pointer', marginTop: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                                >
                                    <Plus size={14} /> Add Product
                                </button>
                            </div>
                        </div>
                    ))}
                    
                    <button 
                        onClick={() => setModal({ show: true, type: 'addCategory', category: '', title: 'Create New Category', name: '', info: {} })}
                        style={{ width: '100%', padding: '15px', borderRadius: '15px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '20px' }}
                    >
                        <Plus size={18} /> New Category
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, overflowY: 'auto', padding: '60px' }}>
                <AnimatePresence mode="wait">
                    {productData ? (
                        <motion.div key={productData.name} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '60px' }}>
                                <div>
                                    <div style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '10px' }}>{selectedCategory} / {productData.name}</div>
                                    <h1 style={{ fontSize: '48px', fontWeight: '900', letterSpacing: '-0.02em' }}>{productData.marketing.name || productData.name}</h1>
                                </div>
                                <div style={{ display: 'flex', gap: '15px' }}>
                                    <button onClick={() => deleteProduct(selectedCategory, productData.name)} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,0,0,0.1)', color: '#ff4444', border: 'none', cursor: 'pointer' }}>
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '500px 1fr', gap: '40px', alignItems: 'start' }}>
                                {/* Gallery Area */}
                                <div 
                                    className="gallery-dropzone"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const files = Array.from(e.dataTransfer.files);
                                        if (files.length > 0) uploadAsset(files[0], 'Product images');
                                    }}
                                    onClick={() => productData.images.length === 0 && fileInputRef.current.click()}
                                    style={{ backgroundColor: '#0a0a0a', borderRadius: '30px', border: '1px solid #111', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: productData.images.length === 0 ? 'pointer' : 'default' }}
                                >
                                    {productData.images.length > 0 ? (
                                        <ImageCarousel 
                                            images={productData.images} 
                                            onAdd={() => fileInputRef.current.click()} 
                                            onDelete={(fn) => deleteAsset(fn, 'Product images')}
                                        />
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#333' }}>
                                            <Upload size={64} style={{ marginBottom: '20px', opacity: 0.2 }} />
                                            <p>Drop or Click to upload images</p>
                                        </div>
                                    )}
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        style={{ display: 'none' }} 
                                        accept="image/*" 
                                        multiple
                                        onChange={(e) => {
                                            if (e.target.files) {
                                                Array.from(e.target.files).forEach(file => uploadAsset(file, 'Product images'));
                                            }
                                        }} 
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Intel Card */}
                                    <div style={{ padding: '30px', borderRadius: '30px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <h3 style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <BarChart3 size={16} /> Marketing Intel
                                        </h3>
                                        
                                        <DetailRow label="Dimensions" value={productData.marketing.size} icon={<Ruler size={14}/>} />
                                        <DetailRow label="Build Time" value={productData.marketing.timeToComplete} icon={<Clock size={14}/>} />
                                        <DetailRow label="Material Cost" value={productData.marketing.materialCost} icon={<AlertCircle size={14}/>} />
                                        <DetailRow label="Unit Price" value={productData.marketing.unitPrice} icon={<CheckCircle2 size={14}/>} color="#f59e0b" />

                                        <button 
                                            onClick={openEditModal}
                                            style={{ width: '100%', marginTop: '20px', padding: '15px', borderRadius: '15px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                                        >
                                            <Edit3 size={16} /> Edit Details
                                        </button>
                                    </div>

                                    {/* Asset Card */}
                                    <div style={{ padding: '30px', borderRadius: '30px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <h3 style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Package size={16} /> Project Assets
                                        </h3>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                            <AssetButton 
                                                icon={<FileCode size={18} />} 
                                                label="SVG Files" 
                                                count={productData.svgs?.length || 0} 
                                                onClick={() => setModal({ show: true, type: 'viewAssets', title: 'SVG Cut Files', assets: productData.svgs || [], folder: 'Design_SVGs' })}
                                            />
                                            <AssetButton 
                                                icon={<ImageIcon size={18} />} 
                                                label="Source Imgs" 
                                                count={productData.designImages?.length || 0} 
                                                onClick={() => setModal({ show: true, type: 'viewAssets', title: 'Design Source Images', assets: productData.designImages || [], folder: 'Design_Images' })}
                                            />
                                            <AssetButton 
                                                icon={<FileText size={18} />} 
                                                label="Setup PDF" 
                                                count={productData.setupPdfs?.length || 0} 
                                                onClick={() => setModal({ show: true, type: 'viewAssets', title: 'Assembly & Setup PDFs', assets: productData.setupPdfs || [], folder: 'Setup' })}
                                            />
                                            <AssetButton 
                                                icon={<MoreHorizontal size={18} />} 
                                                label="Other Assets" 
                                                count={productData.otherAssets?.length || 0} 
                                                onClick={() => setModal({ show: true, type: 'viewAssets', title: 'Miscellaneous Assets', assets: productData.otherAssets || [], folder: 'Other' })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#222' }}>
                            <div style={{ textAlign: 'center' }}>
                                <Package size={80} style={{ marginBottom: '20px', opacity: 0.1 }} />
                                <h3>Select a product to view details</h3>
                            </div>
                        </div>
                    )}
                </AnimatePresence>
            </main>

            {/* Global Loader Overlay */}
            {isLoading && (
                <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 4000, background: '#f59e0b', color: '#000', padding: '10px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', fontSize: '12px' }}>
                    <Loader2 size={16} className="spin" /> SYNCING...
                </div>
            )}

            {/* Custom Modal */}
            <AnimatePresence>
                {modal.show && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} style={{ width: modal.type === 'viewAssets' ? '800px' : modal.type === 'editDetails' ? '600px' : '500px', backgroundColor: '#111', padding: '40px', borderRadius: '30px', border: '1px solid #222', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                                <h2 style={{ fontSize: '24px', fontWeight: '900' }}>{modal.title}</h2>
                                <button onClick={() => setModal({ show: false, type: '', category: '', title: '', name: '', info: {}, assets: [], folder: '' })} style={{ background: 'transparent', border: 'none', color: '#444', cursor: 'pointer' }}><X /></button>
                            </div>
                            
                            {modal.type === 'editDetails' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px' }}>
                                    <Input label="Display Name" value={modal.info.name} onChange={(v) => setModal(m => ({ ...m, info: { ...m.info, name: v } }))} />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', fontWeight: 'bold' }}>Dimensions (H x W x L)</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '10px' }}>
                                            <input placeholder="H" value={modal.info.h} onChange={(e) => setModal(m => ({ ...m, info: { ...m.info, h: e.target.value } }))} style={smallInputStyle} />
                                            <input placeholder="W" value={modal.info.w} onChange={(e) => setModal(m => ({ ...m, info: { ...m.info, w: e.target.value } }))} style={smallInputStyle} />
                                            <input placeholder="L" value={modal.info.l} onChange={(e) => setModal(m => ({ ...m, info: { ...m.info, l: e.target.value } }))} style={smallInputStyle} />
                                            <select value={modal.info.unit} onChange={(e) => setModal(m => ({ ...m, info: { ...m.info, unit: e.target.value } }))} style={selectStyle}>
                                                <option>mm</option><option>cm</option><option>m</option><option>inch</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', fontWeight: 'bold' }}>Build Time</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 30px 1fr 30px', gap: '5px', alignItems: 'center' }}>
                                            <input type="number" placeholder="Hrs" value={modal.info.hrs} onChange={(e) => setModal(m => ({ ...m, info: { ...m.info, hrs: e.target.value } }))} style={smallInputStyle} />
                                            <span style={{ fontSize: '12px', color: '#333', textAlign: 'center' }}>h</span>
                                            <input type="number" placeholder="Mins" value={modal.info.mins} onChange={(e) => setModal(m => ({ ...m, info: { ...m.info, mins: e.target.value } }))} style={smallInputStyle} />
                                            <span style={{ fontSize: '12px', color: '#333', textAlign: 'center' }}>m</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        <Input label="Material Cost (Rs)" value={modal.info.materialCost} onChange={(v) => setModal(m => ({ ...m, info: { ...m.info, materialCost: v } }))} placeholder="0.00" />
                                        <Input label="Unit Price (Rs)" value={modal.info.unitPrice} onChange={(v) => setModal(m => ({ ...m, info: { ...m.info, unitPrice: v } }))} placeholder="0.00" />
                                    </div>
                                    <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                                        <button onClick={handleAction} style={{ flex: 1, padding: '15px', borderRadius: '15px', background: '#f59e0b', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                            <Save size={18} /> Save Changes
                                        </button>
                                    </div>
                                </div>
                            ) : modal.type === 'viewAssets' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <p style={{ fontSize: '12px', color: '#666' }}>Showing files in /{modal.folder}</p>
                                        <button 
                                            onClick={() => assetInputRef.current.click()}
                                            style={{ padding: '10px 20px', borderRadius: '12px', background: '#f59e0b', color: '#000', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                        >
                                            <Plus size={16} /> Upload File
                                        </button>
                                        <input 
                                            type="file" 
                                            ref={assetInputRef} 
                                            style={{ display: 'none' }} 
                                            multiple
                                            onChange={(e) => {
                                                if (e.target.files) {
                                                    Array.from(e.target.files).forEach(file => uploadAsset(file, modal.folder));
                                                }
                                            }} 
                                        />
                                    </div>
                                    
                                    {modal.assets.length > 0 ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                            {modal.assets.map(asset => (
                                                <div key={asset.name} style={{ padding: '20px', borderRadius: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '20px', alignItems: 'center' }}>
                                                    <div style={{ width: '100px', height: '100px', flexShrink: 0, borderRadius: '15px', overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {asset.name.match(/\.(jpe?g|png|webp|gif)$/i) ? (
                                                            <img src={asset.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : asset.name.endsWith('.svg') ? (
                                                            <FileCode size={40} color="#f59e0b" style={{ opacity: 0.5 }} />
                                                        ) : asset.name.endsWith('.pdf') ? (
                                                            <FileText size={40} color="#ff4444" style={{ opacity: 0.5 }} />
                                                        ) : (
                                                            <ImageIcon size={40} color="#3b82f6" style={{ opacity: 0.5 }} />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                                                        <div style={{ display: 'flex', gap: '10px' }}>
                                                            <a href={asset.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textDecoration: 'none', fontSize: '12px' }}>
                                                                <ExternalLink size={14} /> Open
                                                            </a>
                                                            <button 
                                                                onClick={() => deleteAsset(asset.name, modal.folder)}
                                                                style={{ padding: '8px', borderRadius: '10px', background: 'rgba(255,0,0,0.1)', color: '#ff4444', border: 'none', cursor: 'pointer', width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '60px', color: '#333' }}>
                                            <Folder size={64} style={{ marginBottom: '15px', opacity: 0.1 }} />
                                            <p>No files found in this folder</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <input 
                                        autoFocus
                                        value={modal.name}
                                        onChange={(e) => setModal(m => ({ ...m, name: e.target.value }))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAction()}
                                        placeholder="Enter name..."
                                        style={{ width: '100%', padding: '15px', borderRadius: '15px', backgroundColor: '#000', border: '1px solid #222', color: '#fff', outline: 'none' }}
                                    />
                                    <button onClick={handleAction} style={{ width: '100%', padding: '15px', borderRadius: '15px', background: '#f59e0b', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>{modal.type === 'editCategory' ? 'Save Changes' : 'Create'}</button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
};

const smallInputStyle = { width: '100%', padding: '12px', borderRadius: '12px', backgroundColor: '#000', border: '1px solid #222', color: '#fff', outline: 'none', fontSize: '14px', textAlign: 'center' };
const selectStyle = { padding: '12px', borderRadius: '12px', backgroundColor: '#000', border: '1px solid #222', color: '#fff', outline: 'none', fontSize: '14px', cursor: 'pointer' };

const Input = ({ label, value, onChange, placeholder = "" }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', fontWeight: 'bold' }}>{label}</label>
        <input 
            value={value} 
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', padding: '12px 15px', borderRadius: '12px', backgroundColor: '#000', border: '1px solid #222', color: '#fff', outline: 'none', fontSize: '14px' }}
        />
    </div>
);

const AssetButton = ({ icon, label, count, onClick }) => (
    <button 
        onClick={onClick}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 12px', borderRadius: '15px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer', transition: '0.2s all' }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {icon}
            <span style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
        <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 'bold', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '6px' }}>
            {count}
        </div>
    </button>
);

const DetailRow = ({ label, value, icon, color = "#888" }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#555', fontSize: '13px' }}>
            {icon} {label}
        </div>
        <div style={{ fontWeight: 'bold', color: color, fontSize: '14px' }}>{value || '---'}</div>
    </div>
);

const ImageCarousel = ({ images, onAdd, onDelete }) => {
    const [index, setIndex] = useState(0);
    const [direction, setDirection] = useState(0);

    useEffect(() => {
        if (images.length === 0) return;
        const interval = setInterval(() => {
            handleNext();
        }, 6000);
        return () => clearInterval(interval);
    }, [images, index]);

    const handleNext = () => {
        setDirection(1);
        setIndex(prev => (prev + 1) % images.length);
    };

    const handlePrev = () => {
        setDirection(-1);
        setIndex(prev => (prev - 1 + images.length) % images.length);
    };

    return (
        <div style={{ width: '100%', paddingBottom: '100%', position: 'relative' }}>
            {images.length > 1 && (
                <>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                        style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 20, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', padding: '15px', cursor: 'pointer', backdropFilter: 'blur(10px)' }}
                    >
                        <ChevronLeft size={32} />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleNext(); }}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 20, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', padding: '15px', cursor: 'pointer', backdropFilter: 'blur(10px)' }}
                    >
                        <ChevronRight size={32} />
                    </button>
                </>
            )}

            <div style={{ position: 'absolute', inset: '20px', borderRadius: '20px', overflow: 'hidden' }}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={images[index]?.url || 'empty'}
                        initial={{ opacity: 0, x: direction * 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -direction * 50 }}
                        transition={{ duration: 0.3 }}
                        style={{ width: '100%', height: '100%', position: 'relative' }}
                    >
                        {images[index] && (
                            <img
                                src={images[index].url}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        )}
                        <button 
                            onClick={(e) => { e.stopPropagation(); onDelete(images[index]?.name); }}
                            style={{ position: 'absolute', top: '15px', right: '15px', padding: '10px', borderRadius: '12px', background: 'rgba(255,0,0,0.9)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', boxShadow: '0 5px 15px rgba(255,0,0,0.3)' }}
                            title="Delete Image"
                        >
                            <Trash2 size={20} />
                        </button>
                    </motion.div>
                </AnimatePresence>
            </div>
            
            <button 
                onClick={(e) => { e.stopPropagation(); onAdd(); }}
                style={{ position: 'absolute', bottom: '25px', right: '25px', padding: '12px 20px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.9)', color: '#000', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', zIndex: 30, backdropFilter: 'blur(10px)', boxShadow: '0 5px 15px rgba(245, 158, 11, 0.3)', transition: '0.2s all' }}
            >
                <Plus size={16} /> Add Image
            </button>
            
            {images.length > 1 && (
                <div style={{ position: 'absolute', bottom: '35px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px', zIndex: 10 }}>
                    {images.map((_, i) => (
                        <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: i === index ? '#f59e0b' : 'rgba(255,255,255,0.2)', transition: '0.3s' }} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ProductContainer;
