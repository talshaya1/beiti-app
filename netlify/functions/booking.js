const https = require('https');

exports.handler = async (event) => {
  const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
  const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  const host = new URL(SUPABASE_URL).hostname;

  function supabaseRequest(method, path, body) {
    return new Promise((resolve, reject) => {
      const bodyBuf = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
      const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
      };
      if (bodyBuf) headers['Content-Length'] = bodyBuf.length;
      if (method === 'POST') headers['Prefer'] = 'return=minimal';

      const req = https.request({ hostname: host, path, method, headers }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  if (event.httpMethod === 'GET') {
    const date = event.queryStringParameters?.date;
    if (!date) return { statusCode: 400, body: JSON.stringify({ error: 'date required' }) };
    try {
      const r = await supabaseRequest('GET', `/rest/v1/bookings?select=time&date=eq.${date}`);
      const rows = JSON.parse(r.body);
      const booked = Array.isArray(rows) ? rows.map(row => row.time) : [];
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booked }) };
    } catch (e) {
      return { statusCode: 200, body: JSON.stringify({ booked: [] }) };
    }
  }

  if (event.httpMethod === 'POST') {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const { date, time, phone, email } = JSON.parse(raw);
    if (!date || !time || !phone) return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };

    try {
      // Check if slot already taken
      const check = await supabaseRequest('GET', `/rest/v1/bookings?select=id&date=eq.${date}&time=eq.${time}`);
      const existing = JSON.parse(check.body);
      if (Array.isArray(existing) && existing.length > 0) {
        return { statusCode: 409, body: JSON.stringify({ error: 'ALREADY_BOOKED' }) };
      }

      // Insert booking
      await supabaseRequest('POST', '/rest/v1/bookings', { date, time, phone, email: email || null });
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true }) };
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
