const https = require('https');

exports.handler = async (event) => {
  const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
  const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();

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

  // POST: record an event
  if (event.httpMethod === 'POST') {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const data = JSON.parse(raw);
    const { type } = data;

    if (type === 'visit') {
      await supabaseRequest('POST', '/rest/v1/visits', { created_at: new Date().toISOString() });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (type === 'survey') {
      const { area, people, floors, has_basement, has_rental } = data;
      await supabaseRequest('POST', '/rest/v1/surveys', {
        area: area || null,
        people: people || null,
        floors: floors || null,
        has_basement: !!has_basement,
        has_rental: !!has_rental,
        created_at: new Date().toISOString()
      });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (type === 'ai_request') {
      await supabaseRequest('POST', '/rest/v1/ai_requests', { created_at: new Date().toISOString() });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'unknown type' }) };
  }

  // GET: admin dashboard data
  if (event.httpMethod === 'GET') {
    const token = event.queryStringParameters?.token;
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return { statusCode: 403, body: JSON.stringify({ error: 'forbidden' }) };
    }

    try {
      const [visits, surveys, aiReqs, bookings] = await Promise.all([
        supabaseRequest('GET', '/rest/v1/visits?select=id'),
        supabaseRequest('GET', '/rest/v1/surveys?select=people,floors,has_basement,has_rental'),
        supabaseRequest('GET', '/rest/v1/ai_requests?select=id'),
        supabaseRequest('GET', '/rest/v1/bookings?select=id'),
      ]);

      const visitCount = JSON.parse(visits.body).length || 0;
      const aiCount = JSON.parse(aiReqs.body).length || 0;
      const bookingCount = JSON.parse(bookings.body).length || 0;

      const surveyRows = JSON.parse(surveys.body) || [];
      const surveyCount = surveyRows.length;

      let avgPeople = 0, avgFloors = 0, basementCount = 0, rentalCount = 0;
      if (surveyCount > 0) {
        avgPeople = Math.round(surveyRows.reduce((s, r) => s + (r.people || 0), 0) / surveyCount * 10) / 10;
        // most common floors
        const floorFreq = {};
        surveyRows.forEach(r => { if (r.floors) floorFreq[r.floors] = (floorFreq[r.floors] || 0) + 1; });
        avgFloors = Object.entries(floorFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
        basementCount = surveyRows.filter(r => r.has_basement).length;
        rentalCount = surveyRows.filter(r => r.has_rental).length;
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visits: visitCount,
          ai_requests: aiCount,
          bookings: bookingCount,
          avg_people: avgPeople,
          top_floors: avgFloors,
          basement_count: basementCount,
          rental_count: rentalCount,
          survey_count: surveyCount,
        })
      };
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
