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

import osrmRoute from './osrm-client';

const EARTH_RADIUS_KM = 6371;
const KM_TO_MILES = 0.621371;

function toRad(deg) {
  return deg * (Math.PI / 180);
}

export default function calculateDistance(origin, destination) {
  const [lat1, lon1] = origin;
  const [lat2, lon2] = destination;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = EARTH_RADIUS_KM * c;

  return {
    km: Math.round(km * 100) / 100,
    miles: Math.round(km * KM_TO_MILES * 100) / 100,
  };
}

export function calculateRoadDistance(origin, destination) {
  return osrmRoute(origin, destination)
    .catch(() => {
      const fallback = calculateDistance(origin, destination);
      fallback.durationMinutes = null;
      fallback.isEstimate = true;
      return fallback;
    });
}
