const diagnose = require('../api/diagnose');

function parseJsonBody(req, res, next) {
  if (req.body !== undefined || req.method !== 'POST') {
    next();
    return;
  }

  let body = '';
  let tooLarge = false;
  req.on('data', (chunk) => {
    body += chunk.toString();
    if (body.length > 55000) tooLarge = true;
  });
  req.on('end', () => {
    if (tooLarge) {
      res.status(413).json({ error: 'Request body is too large.' });
      return;
    }
    try {
      req.body = body ? JSON.parse(body) : {};
      next();
    } catch {
      res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
  });
  req.on('error', next);
}

module.exports = function setupProxy(app) {
  app.all('/api/diagnose', parseJsonBody, diagnose);
};