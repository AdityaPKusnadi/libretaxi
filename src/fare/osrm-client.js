import Settings from '../../settings';
import log from '../log';

const settings = new Settings();

function makeRequest(url, timeoutMs) {
  const mod = url.startsWith('https') ? require('https') : require('http');

  return new Promise((resolve, reject) => {
    const req = mod.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code !== 'Ok' || !json.routes || !json.routes.length) {
            reject(new Error(`OSRM error: ${json.code || 'no routes'}`));
            return;
          }
          const route = json.routes[0];
          const km = Math.round((route.distance / 1000) * 100) / 100;
          const miles = Math.round(km * 0.621371 * 100) / 100;
          const durationMinutes = Math.round(route.duration / 60);
          resolve({ km, miles, durationMinutes });
        } catch (e) {
          reject(new Error(`OSRM parse error: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`OSRM request error: ${e.message}`)));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('OSRM request timeout'));
    });
  });
}

export default function osrmRoute(origin, destination) {
  if (!origin || !destination || !Array.isArray(origin) || !Array.isArray(destination)) {
    return Promise.reject(new Error('OSRM: invalid coordinates'));
  }

  const [lat1, lon1] = origin;
  const [lat2, lon2] = destination;

  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return Promise.reject(new Error('OSRM: null/zero coordinates'));
  }

  const baseUrl = settings.OSRM_SERVER_URL || 'https://router.project-osrm.org';
  const url = `${baseUrl}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 30000;

  function attempt(retryNum) {
    log.debug(`OSRM request attempt ${retryNum + 1}/${MAX_RETRIES}: ${url}`);
    return makeRequest(url, TIMEOUT_MS).catch((err) => {
      log.debug(`OSRM attempt ${retryNum + 1} failed: ${err.message}`);
      if (retryNum + 1 < MAX_RETRIES) {
        const delay = (retryNum + 1) * 2000;
        return new Promise((r) => setTimeout(r, delay)).then(() => attempt(retryNum + 1));
      }
      throw err;
    });
  }

  return attempt(0);
}
