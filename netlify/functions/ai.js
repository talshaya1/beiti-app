exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: { message: 'مفتاح API غير مضبوط' } }) };
  }

  try {
    const body = JSON.parse(event.body);
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: e.message } })
    };
  }
};
