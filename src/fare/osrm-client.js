/*
    LibreTaxi, free and open source ride sharing platform.
    Copyright (C) 2016-2017  Roman Pushkin

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import Settings from '../../settings';

const settings = new Settings();

export default function osrmRoute(origin, destination) {
  const [lat1, lon1] = origin;
  const [lat2, lon2] = destination;
  const baseUrl = settings.OSRM_SERVER_URL || 'https://router.project-osrm.org';
  const url = `${baseUrl}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;

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
    req.setTimeout(10000, () => {
      req.abort();
      reject(new Error('OSRM request timeout'));
    });
  });
}
