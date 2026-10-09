const express = require('express');
const router = express.Router();

function extractWeatherLocation(message) {
  const match = message.match(/\b(?:in|at|for)\s+([a-zA-Z][a-zA-Z .'-]*?)(?:\?|$|\s+(?:today|now|currently|right now)\b)/i);
  return match ? match[1].trim() : null;
}

async function getWeatherContext(message) {
  if (!/\b(weather|temperature|forecast|rain|raining|sunny|humid|wind)\b/i.test(message)) {
    return '';
  }

  const location = extractWeatherLocation(message);
  if (!location) {
    return 'This is a weather question, but the user did not provide a city. Ask which city they mean.';
  }

  const geocodingResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
  );
  if (!geocodingResponse.ok) {
    throw new Error('Weather location lookup failed');
  }

  const geocodingData = await geocodingResponse.json();
  const place = geocodingData.results?.[0];
  if (!place) {
    return `I could not find a location named ${location}. Ask the user to provide a nearby city.`;
  }

  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m&timezone=auto`
  );
  if (!weatherResponse.ok) {
    throw new Error('Current weather lookup failed');
  }

  const weather = await weatherResponse.json();
  const current = weather.current;
  return [
    `Live weather data for ${place.name}, ${place.country}:`,
    `temperature ${current.temperature_2m}${weather.current_units.temperature_2m},`,
    `feels like ${current.apparent_temperature}${weather.current_units.apparent_temperature},`,
    `humidity ${current.relative_humidity_2m}${weather.current_units.relative_humidity_2m},`,
    `wind ${current.wind_speed_10m}${weather.current_units.wind_speed_10m},`,
    `precipitation ${current.precipitation}${weather.current_units.precipitation}.`,
    'Use these live values in the answer and do not say that you cannot provide real-time weather.'
  ].join(' ');
}

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    if (typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'No message provided' });
    }

    const weatherContext = await getWeatherContext(message);
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 100,
        messages: [
          {
            role: 'system',
            content: `You are Echo, a helpful voice assistant. Reply in one short sentence. Do not use markdown, bullet points, or emojis. Do not introduce yourself. Respond directly to what the user said. ${weatherContext}`
          },
          {
            role: 'user',
            content: message
          }
        ]
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API Error:', errorText);
      return res.status(500).json({ error: `OpenAI API Error: ${errorText}` });
    }

    const data = await openaiResponse.json();
    const reply = data.choices[0]?.message?.content || '';
    return res.json({ reply });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: `Server Error: ${error.message}` });
  }
});

module.exports = router;
