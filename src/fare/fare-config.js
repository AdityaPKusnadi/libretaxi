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

import { saveConfigToOracle, getConfigFromOracle } from '../support/oracle-db';

const ORACLE_KEY = 'libretaxi:fare_config';
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

export default function loadFareConfig() {
  if (cachedConfig) return Object.assign({}, cachedConfig);
  return Object.assign({}, DEFAULT_CONFIG);
}

export function saveFareConfig(updates) {
  const current = loadFareConfig();
  const merged = Object.assign({}, current, updates);
  cachedConfig = merged;
  try {
    saveConfigToOracle(ORACLE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.log(`Error saving fare config to Oracle: ${e}`);
  }
  return merged;
}

export async function loadFareConfigFromOracle() {
  try {
    const data = await getConfigFromOracle(ORACLE_KEY);
    if (!data) {
      cachedConfig = Object.assign({}, DEFAULT_CONFIG);
    } else {
      cachedConfig = Object.assign({}, DEFAULT_CONFIG, JSON.parse(data));
    }
    return cachedConfig;
  } catch (e) {
    cachedConfig = Object.assign({}, DEFAULT_CONFIG);
    return cachedConfig;
  }
}

export function saveRadius(val) {
  cachedRadius = val;
  try {
    saveConfigToOracle(RADIUS_KEY, String(val));
  } catch (e) {
    console.log(`Error saving radius to Oracle: ${e}`);
  }
}

export function getRadius() {
  return cachedRadius;
}

export async function loadRadiusFromOracle(defaultRadius) {
  try {
    const data = await getConfigFromOracle(RADIUS_KEY);
    if (!data) {
      cachedRadius = defaultRadius;
    } else {
      cachedRadius = parseInt(data, 10) || defaultRadius;
    }
    return cachedRadius;
  } catch (e) {
    cachedRadius = defaultRadius;
    return cachedRadius;
  }
}
