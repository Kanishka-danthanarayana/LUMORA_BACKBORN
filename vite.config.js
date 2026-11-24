import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const productsApi = () => ({
  name: 'products-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const fullUrl = req.originalUrl || req.url;
      if (!fullUrl.startsWith('/api/products')) return next();

      const productsDir = path.resolve(__dirname, 'src/features/Product/PRODUCTS');
      res.setHeader('Content-Type', 'application/json');
      
      console.log(`[Products API] ${req.method} ${fullUrl}`);

      const readBody = (req) => new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
      });

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
              return { name: entry.name, kind: 'file', url: `/src/features/Product/PRODUCTS${relativePath}` };
            });
          };
          const data = scan(productsDir);
          res.end(JSON.stringify(data));
        } 
        
        else if (req.method === 'POST') {
          const body = await readBody(req);
          try {
              const data = JSON.parse(body);
              
              // Handle Image/Asset Upload
              if (data.type === 'upload') {
                  const { category, name, fileName, base64, folder } = data;
                  const targetFolder = folder || 'Product images';
                  const filePath = path.join(productsDir, category, name, targetFolder, fileName);
                  fs.mkdirSync(path.dirname(filePath), { recursive: true });
                  const buffer = Buffer.from(base64, 'base64');
                  fs.writeFileSync(filePath, buffer);
                  console.log(`[Products API] Uploaded ${fileName} to ${targetFolder}`);
                  res.end(JSON.stringify({ success: true }));
                  return;
              }

              // Handle Product/Category Creation
              const { category, name } = data;
              if (name) {
                  const prodPath = path.join(productsDir, category, name);
                  ['Product images', 'Design_SVGs', 'Design_Images', 'Marketing', 'Setup', 'Other'].forEach(d => 
                      fs.mkdirSync(path.join(prodPath, d), { recursive: true })
                  );
                  fs.writeFileSync(path.join(prodPath, 'Marketing/info.json'), JSON.stringify({ name, size: "", timeToComplete: "", materialCost: "", unitPrice: "" }, null, 2));
                  console.log(`[Products API] Created product: ${category}/${name}`);
              } else if (category) {
                  const catPath = path.join(productsDir, category);
                  fs.mkdirSync(catPath, { recursive: true });
                  console.log(`[Products API] Created category: ${category}`);
              }
              res.end(JSON.stringify({ success: true }));
          } catch (e) {
              console.error("[Products API] POST Error:", e);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
          }
        }

        else if (req.method === 'PUT') {
            const body = await readBody(req);
            try {
                const data = JSON.parse(body);
                
                // Handle Category Rename
                if (data.type === 'renameCategory') {
                    const { oldName, newName } = data;
                    const oldPath = path.join(productsDir, oldName);
                    const newPath = path.join(productsDir, newName);
                    if (fs.existsSync(oldPath)) {
                        try {
                            fs.renameSync(oldPath, newPath);
                        } catch (renameErr) {
                            console.warn(`[Products API] renameSync failed, attempting copy and delete fallback... (${renameErr.message})`);
                            fs.cpSync(oldPath, newPath, { recursive: true });
                            fs.rmSync(oldPath, { recursive: true, force: true });
                        }
                        console.log(`[Products API] Renamed category: ${oldName} -> ${newName}`);
                    }
                    res.end(JSON.stringify({ success: true }));
                    return;
                }

                const { category, name, info } = data;
                
                let currentName = name;
                // If the name changed, rename the folder first
                if (info.name && info.name !== name) {
                    const oldPath = path.join(productsDir, category, name);
                    const newPath = path.join(productsDir, category, info.name);
                    
                    if (fs.existsSync(oldPath)) {
                        try {
                            fs.renameSync(oldPath, newPath);
                        } catch (renameErr) {
                            console.warn(`[Products API] renameSync failed for product, attempting copy and delete fallback... (${renameErr.message})`);
                            fs.cpSync(oldPath, newPath, { recursive: true });
                            fs.rmSync(oldPath, { recursive: true, force: true });
                        }
                        console.log(`[Products API] Renamed product folder: ${name} -> ${info.name}`);
                        currentName = info.name;
                    }
                }

                const infoPath = path.join(productsDir, category, currentName, 'Marketing/info.json');
                console.log(`[Products API] Updating info: ${category}/${currentName}`);
                fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
                res.end(JSON.stringify({ success: true, newName: currentName }));
            } catch (e) {
                console.error("[Products API] PUT Error:", e);
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
                // Delete specific file
                const targetFolder = url.searchParams.get('folder') || 'Product images';
                const filePath = path.join(productsDir, category, name, targetFolder, fileName);
                console.log(`[Products API] Deleting asset: ${filePath}`);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                res.end(JSON.stringify({ success: true }));
            } else if (category && !name) {
                // Delete whole category
                const catPath = path.join(productsDir, category);
                console.log(`[Products API] Deleting category: ${catPath}`);
                if (fs.existsSync(catPath)) {
                    fs.rmSync(catPath, { recursive: true, force: true });
                }
                res.end(JSON.stringify({ success: true }));
            } else if (category && name) {
                // Delete full product
                const prodPath = path.join(productsDir, category, name);
                console.log(`[Products API] Deleting product: ${prodPath}`);
                if (fs.existsSync(prodPath)) {
                    fs.rmSync(prodPath, { recursive: true, force: true });
                }
                res.end(JSON.stringify({ success: true }));
            } else {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Invalid delete request" }));
            }
        }
      } catch (err) {
        console.error("Server Error:", err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
});

export default defineConfig({
  plugins: [react(), productsApi()],
})
