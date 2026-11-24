const http = require('node:http');
const { Registry, Counter, collectDefaultMetrics } = require('prom-client');
const registry = new Registry();
collectDefaultMetrics({ register: registry });
const requests = new Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'], registers: [registry] });
const routes = new Set(['/', '/health', '/metrics']);
const server = http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  res.on('finish', () => requests.inc({ method: req.method, route: routes.has(path) ? path : 'other', status: String(res.statusCode) }));
  if (req.method !== 'GET' || !routes.has(path)) {
    res.writeHead(404); return res.end('Not found');
  }
  if (path === '/') { res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('DevOps Final Project'); }
  if (path === '/health') { res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({status:'ok'})); }
  try { const metrics = await registry.metrics(); res.writeHead(200, {'Content-Type': registry.contentType}); res.end(metrics); }
  catch { res.writeHead(500); res.end('Metrics unavailable'); }
});
if (require.main === module) server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
module.exports = server;
