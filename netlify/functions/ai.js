const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: 'مفتاح API غير مضبوط' } })
    };
  }

  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    const bodyBuffer = Buffer.from(rawBody, 'utf8');

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'Content-Length': bodyBuffer.length
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      });

      req.on('error', reject);
      req.write(bodyBuffer);
      req.end();
    });

    return {
      statusCode: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: result.body
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: e.message } })
    };
  }
};
