const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const apiTarget = new URL(process.env.SHIFAA_API_PROXY_TARGET || 'http://127.0.0.1:3000');

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => (request, response, next) => {
    if (!request.url?.startsWith('/v1/')) return metroMiddleware(request, response, next);
    const proxy = http.request(
      {
        protocol: apiTarget.protocol,
        hostname: apiTarget.hostname,
        port: apiTarget.port,
        method: request.method,
        path: request.url,
        headers: { ...request.headers, host: apiTarget.host },
      },
      (upstream) => {
        response.writeHead(upstream.statusCode || 502, upstream.headers);
        upstream.pipe(response);
      },
    );
    proxy.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 'auth-degraded' }));
    });
    request.pipe(proxy);
  },
};

module.exports = config;
