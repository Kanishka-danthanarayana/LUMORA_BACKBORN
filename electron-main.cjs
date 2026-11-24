const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const fs = require('fs');
const cors = require('cors');

const isDev = !app.isPackaged;
let productsDir;

if (isDev) {
  productsDir = path.resolve(__dirname, 'src/features/Product/PRODUCTS');
} else {
  // If running as a Portable app, this env variable holds the folder where the .exe is.
  // Otherwise fallback to the folder containing the executable.
  const exeFolder = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
  productsDir = path.join(exeFolder, 'PRODUCTS');
}

if (!isDev && !fs.existsSync(productsDir)) {
  fs.mkdirSync(productsDir, { recursive: true });
}

const expressApp = express();
expressApp.use(cors());
// Increase payload limit for base64 images
expressApp.use(express.json({ limit: '50mb' }));
expressApp.use(express.urlencoded({ limit: '50mb', extended: true }));

expressApp.use('/api/products', async (req, res, next) => {
  const fullUrl = req.originalUrl || req.url;
  res.setHeader('Content-Type', 'application/json');
  
  console.log(`[Products API] ${req.method} ${fullUrl}`);

  try {
    if (req.method === 'GET') {
      const scan = (dir) => {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir, { withFileTypes: true }).map(entry => {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const item = { name: entry.name, kind: 'directory', children: scan(fullPath) };
            if (entry.name === 'Marketing') {
              const infoPath = path.join(fullPath, 'info.json');
              if (fs.existsSync(infoPath)) {
                try {
                    item.info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
                } catch (e) {
                    console.error(`Error parsing info.json at ${infoPath}`, e);
                }
              }
            }
            return item;
          }
          const relativePath = fullPath.split('PRODUCTS')[1].replace(/\\/g, '/');
          return { name: entry.name, kind: 'file', url: `/api/products-static${relativePath}` };
        });
      };
      const data = scan(productsDir);
      res.end(JSON.stringify(data));
    } 
    
    else if (req.method === 'POST') {
      try {
          const data = req.body;
          
          if (data.type === 'upload') {
              const { category, name, fileName, base64, folder } = data;
              const targetFolder = folder || 'Product images';
              const filePath = path.join(productsDir, category, name, targetFolder, fileName);
              fs.mkdirSync(path.dirname(filePath), { recursive: true });
              const buffer = Buffer.from(base64, 'base64');
              fs.writeFileSync(filePath, buffer);
              res.end(JSON.stringify({ success: true }));
              return;
          }

          const { category, name } = data;
          if (name) {
              const prodPath = path.join(productsDir, category, name);
              ['Product images', 'Design_SVGs', 'Design_Images', 'Marketing', 'Setup', 'Other'].forEach(d => 
                  fs.mkdirSync(path.join(prodPath, d), { recursive: true })
              );
              fs.writeFileSync(path.join(prodPath, 'Marketing/info.json'), JSON.stringify({ name, size: "", timeToComplete: "", materialCost: "", unitPrice: "" }, null, 2));
          } else if (category) {
              const catPath = path.join(productsDir, category);
              fs.mkdirSync(catPath, { recursive: true });
          }
          res.end(JSON.stringify({ success: true }));
      } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
      }
    }

    else if (req.method === 'PUT') {
        try {
            const data = req.body;
            
            if (data.type === 'renameCategory') {
                const { oldName, newName } = data;
                const oldPath = path.join(productsDir, oldName);
                const newPath = path.join(productsDir, newName);
                if (fs.existsSync(oldPath)) {
                    try { fs.renameSync(oldPath, newPath); } 
                    catch (renameErr) {
                        fs.cpSync(oldPath, newPath, { recursive: true });
                        fs.rmSync(oldPath, { recursive: true, force: true });
                    }
                }
                res.end(JSON.stringify({ success: true }));
                return;
            }

            const { category, name, info } = data;
            let currentName = name;
            if (info.name && info.name !== name) {
                const oldPath = path.join(productsDir, category, name);
                const newPath = path.join(productsDir, category, info.name);
                if (fs.existsSync(oldPath)) {
                    try { fs.renameSync(oldPath, newPath); } 
                    catch (renameErr) {
                        fs.cpSync(oldPath, newPath, { recursive: true });
                        fs.rmSync(oldPath, { recursive: true, force: true });
                    }
                    currentName = info.name;
                }
            }

            const infoPath = path.join(productsDir, category, currentName, 'Marketing/info.json');
            fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
            res.end(JSON.stringify({ success: true, newName: currentName }));
        } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
        }
    }

    else if (req.method === 'DELETE') {
        const url = new URL(fullUrl, 'http://localhost');
        const category = url.searchParams.get('category');
        const name = url.searchParams.get('name');
        const fileName = url.searchParams.get('fileName');
        
        if (fileName) {
            const targetFolder = url.searchParams.get('folder') || 'Product images';
            const filePath = path.join(productsDir, category, name, targetFolder, fileName);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            res.end(JSON.stringify({ success: true }));
        } else if (category && !name) {
            const catPath = path.join(productsDir, category);
            if (fs.existsSync(catPath)) fs.rmSync(catPath, { recursive: true, force: true });
            res.end(JSON.stringify({ success: true }));
        } else if (category && name) {
            const prodPath = path.join(productsDir, category, name);
            if (fs.existsSync(prodPath)) fs.rmSync(prodPath, { recursive: true, force: true });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid delete request" }));
        }
    }
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
});

// Serve product assets (images, svgs, etc) statically
expressApp.use('/api/products-static', express.static(productsDir));

// Serve React static files (only in production)
if (!isDev) {
  const distPath = path.join(__dirname, 'dist');
  expressApp.use(express.static(distPath));
  expressApp.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const SERVER_PORT = 3456;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  if (isDev) {
    // In dev, load from the Vite server which we assume runs on 5173
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // In production, load from the local Express server
    win.loadURL(`http://localhost:${SERVER_PORT}`);
  }
}

app.whenReady().then(() => {
  expressApp.listen(SERVER_PORT, () => {
    console.log(`Local Express server running on port ${SERVER_PORT}`);
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
