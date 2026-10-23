import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

const PY_PORT = 8001;
const PORT = 3000;

// Start Python backend process
// Start Python backend process
const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
console.log('Starting Python backend on port', PY_PORT);
const pyProcess: ChildProcess = spawn(pythonBin, ['backend/server.py'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PY_PORT), PYTHONPATH: '.' }
});

const cleanup = () => {
  if (pyProcess && !pyProcess.killed) {
    try {
      pyProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
};

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

async function startServer() {
  const app = express();

  // Forward /api requests to the Python backend on 127.0.0.1:8001
  app.use('/api', (req, res) => {
    const options = {
      hostname: '127.0.0.1',
      port: PY_PORT,
      path: req.originalUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${PY_PORT}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({
        error: 'Sohail Autos backend server is starting up or temporarily offline. Please retry in a moment.',
        detail: String(err)
      });
    });

    req.pipe(proxyReq, { end: true });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  } else {
    // Mount Vite in middleware mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sohail Autos Desktop Application serving on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  cleanup();
  process.exit(1);
});
