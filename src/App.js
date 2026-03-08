export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey } = req.body;

    console.log('Received request with API key:', apiKey ? apiKey.substring(0, 8) + '...' : 'NO KEY');

    if (!apiKey) {
      console.log('ERROR: No API key provided');
      return res.status(400).json({ error: 'API key required' });
    }

    console.log('Calling AISStream...');
    
    const response = await fetch('https://aisstream.io/v0/stream', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Ship-Tracker-App'
      },
      body: JSON.stringify({
        APIkey: apiKey,
        BoundingBox: [
          { lat: 90, lon: -180 },
          { lat: -90, lon: 180 }
        ]
      })
    });

    console.log('AISStream response status:', response.status);
    
    const responseText = await response.text();
    console.log('AISStream response:', responseText.substring(0, 200));

    if (!response.ok) {
      console.log('ERROR: AISStream returned', response.status);
      return res.status(response.status).json({ 
        error: `AISStream error: ${response.status}`,
        details: responseText.substring(0, 200)
      });
    }

    const data = JSON.parse(responseText);
    console.log('SUCCESS: Got data from AISStream');
    return res.status(200).json(data);

  } catch (error) {
    console.error('ERROR in handler:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
