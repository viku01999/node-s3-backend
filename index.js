const express = require('express');
const axios = require('axios');
const geoip = require('geoip-lite');

const app = express();
app.use(express.json());
app.set('trust proxy', true);

// 🧠 Simple in-memory cache
const cache = new Map();
const TTL = 60 * 60 * 1000; // 1 hour

function setCache(key, value) {
  cache.set(key, {
    value,
    expiry: Date.now() + TTL
  });
}

function getCache(key) {
  const data = cache.get(key);
  if (!data) return null;

  if (Date.now() > data.expiry) {
    cache.delete(key);
    return null;
  }

  return data.value;
}

// 🔧 Normalize IP
function getClientIP(req) {
  let ip =
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket.remoteAddress;

  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  return ip;
}

// 🔧 Normalize location
function normalizeLocation(addr = {}) {
  return {
    city: addr.city || addr.town || addr.village || addr.county || null,
    state: addr.state || addr.region || null,
    country: addr.country || null
  };
}

// 🌍 Reverse Geocode (GPS)
async function reverseGeocode(lat, lon) {
  const res = await axios.get(
    'https://nominatim.openstreetmap.org/reverse',
    {
      params: { lat, lon, format: 'json' },
      headers: { 'User-Agent': 'geo-service' }
    }
  );
  return normalizeLocation(res.data.address);
}

// 🌐 External IP lookup fallback
async function ipLookupExternal(ip = '182.156.189.44') {
  ip = '182.156.189.44';
  const res = await axios.get(`https://ipapi.co/${ip}/json/`);
  console.log("Respponse for this IP ", ip, res.data)
  return {
    city: res.data.city,
    state: res.data.region,
    country: res.data.country_name
  };
}

// 🚀 Main API
app.post('/location', async (req, res) => {
  try {
    const { lat, lon } = req.body || {};
    const ip = getClientIP(req);

    const cacheKey = lat && lon ? `gps:${lat},${lon}` : `ip:${ip}`;

    // ✅ Check cache
    const cached = getCache(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    let result;

    // 🥇 GPS (accurate)
    if (lat && lon) {
      const location = await reverseGeocode(lat, lon);
      result = { source: 'gps', ...location };
    } else {
      // 🥈 IP (local DB)
      const geo = geoip.lookup(ip);

      if (geo) {
        result = {
          source: 'ip-local',
          city: geo.city,
          state: geo.region,
          country: geo.country
        };
      } else {
        // 🥉 External fallback
        const location = await ipLookupExternal(ip);
        result = { source: 'ip-external', ...location };
      }
    }

    // 💾 Cache result
    setCache(cacheKey, result);

    res.json(result);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      source: 'error',
      message: 'Location detection failed'
    });
  }
});

// 🚀 Start server
app.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});

ipLookupExternal()