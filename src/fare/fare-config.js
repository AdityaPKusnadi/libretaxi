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

import kue from 'kue';

const REDIS_KEY = 'libretaxi:fare_config';
const RADIUS_KEY = 'libretaxi:max_radius';

const DEFAULT_CONFIG = {
  currency: 'LKR',
  currencySymbol: 'LKR ',
  baseFare: 300,
  baseKm: 3,
  perKmRate: 100,
  useKilometres: true,
};

let cachedConfig = null;
let cachedRadius = null;
let redisClient = null;

function getRedis() {
  if (!redisClient) {
    redisClient = kue.redis.createClient();
  }
  return redisClient;
}

export default function loadFareConfig() {
  if (cachedConfig) return Object.assign({}, cachedConfig);
  return Object.assign({}, DEFAULT_CONFIG);
}

export function saveFareConfig(updates) {
  const current = loadFareConfig();
  const merged = Object.assign({}, current, updates);
  cachedConfig = merged;
  try {
    getRedis().set(REDIS_KEY, JSON.stringify(merged));
  } catch (e) {
    console.log(`Error saving fare config to Redis: ${e}`);
  }
  return merged;
}

export function loadFareConfigFromRedis() {
  return new Promise((resolve) => {
    try {
      getRedis().get(REDIS_KEY, (err, data) => {
        if (err || !data) {
          cachedConfig = Object.assign({}, DEFAULT_CONFIG);
        } else {
          cachedConfig = Object.assign({}, DEFAULT_CONFIG, JSON.parse(data));
        }
        resolve(cachedConfig);
      });
    } catch (e) {
      cachedConfig = Object.assign({}, DEFAULT_CONFIG);
      resolve(cachedConfig);
    }
  });
}

export function saveRadius(val) {
  cachedRadius = val;
  try {
    getRedis().set(RADIUS_KEY, String(val));
  } catch (e) {
    console.log(`Error saving radius to Redis: ${e}`);
  }
}

export function getRadius() {
  return cachedRadius;
}

export function loadRadiusFromRedis(defaultRadius) {
  return new Promise((resolve) => {
    try {
      getRedis().get(RADIUS_KEY, (err, data) => {
        if (err || !data) {
          cachedRadius = defaultRadius;
        } else {
          cachedRadius = parseInt(data, 10) || defaultRadius;
        }
        resolve(cachedRadius);
      });
    } catch (e) {
      cachedRadius = defaultRadius;
      resolve(cachedRadius);
    }
  });
}
