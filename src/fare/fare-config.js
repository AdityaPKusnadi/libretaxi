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

import fs from 'fs';
import appRoot from 'app-root-path';

/**
 * Fare configuration loader.
 *
 * Reads fare-config.json on every call so that config changes take effect
 * immediately without restarting the bot.
 *
 * @author LibreTaxi contributors
 * @date 2026-03-06
 * @version 1.0
 * @since 0.1.0
 */

const CONFIG_PATH = `${appRoot.path}/fare-config.json`;

// Default config used when fare-config.json is missing or unreadable.
const DEFAULT_CONFIG = {
  currency: 'USD',
  currencySymbol: '$',
  baseFare: 2.50,
  perKmRate: 1.20,
  minimumFare: 5.00,
  useKilometres: true,
  surgeMultiplier: 1.0,
  timeMultipliers: [],
  vehicleTypeMultipliers: { car: 1.0, motorbike: 0.7 },
};

/**
 * Load and return the fare configuration.
 * Re-reads the JSON file each time so edits take effect instantly.
 *
 * @return {Object} Merged config (file values override defaults).
 */
export default function loadFareConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign({}, DEFAULT_CONFIG, parsed);
  } catch (e) {
    // If file is missing or malformed, fall back to defaults.
    return Object.assign({}, DEFAULT_CONFIG);
  }
}
