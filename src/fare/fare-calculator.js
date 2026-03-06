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

import calculateDistance from './distance-calculator';
import loadFareConfig from './fare-config';

/**
 * Fare calculator.
 *
 * Computes a fare based on distance, vehicle type and the current
 * configuration in fare-config.json. Supports:
 *  - Base fare
 *  - Per-km (or per-mile) distance rate
 *  - Minimum fare floor
 *  - Surge / manual multiplier
 *  - Time-of-day multipliers (night, rush-hour, etc.)
 *  - Vehicle-type multipliers (car vs motorbike)
 *
 * The logic is deliberately kept in small, pure functions so each component
 * can be tested and extended independently.
 *
 * @author LibreTaxi contributors
 * @date 2026-03-06
 * @version 1.0
 * @since 0.1.0
 */

/**
 * Determine which time-based multiplier (if any) applies right now.
 *
 * @param {Array} timeMultipliers - array from config, each with
 *   { startHour, endHour, multiplier, label }
 * @param {number} currentHour - 0-23
 * @return {Object} { multiplier, label } — first matching window, or
 *   { multiplier: 1.0, label: null } if none match
 */
export function getTimeMultiplier(timeMultipliers, currentHour) {
  if (!Array.isArray(timeMultipliers)) return { multiplier: 1.0, label: null };

  for (const window of timeMultipliers) {
    const { startHour, endHour, multiplier, label } = window;
    // Handle overnight ranges (e.g. 22–6)
    if (startHour > endHour) {
      if (currentHour >= startHour || currentHour < endHour) {
        return { multiplier, label };
      }
    } else {
      if (currentHour >= startHour && currentHour < endHour) {
        return { multiplier, label };
      }
    }
  }
  return { multiplier: 1.0, label: null };
}

/**
 * Calculate a fare for a trip.
 *
 * @param {Array} origin - [lat, lng]
 * @param {Array} destination - [lat, lng]
 * @param {Object} options
 * @param {string} options.vehicleType - 'car' | 'motorbike'
 * @param {Object} [options.configOverride] - optional config override (for testing)
 * @return {Object} Fare breakdown:
 *   { distanceKm, distanceMiles, distanceDisplay, baseFare, distanceFare,
 *     surgeMultiplier, timeMultiplier, timeLabel, vehicleMultiplier,
 *     subtotal, totalFare, currency, currencySymbol, useKilometres }
 */
export default function calculateFare(origin, destination, options = {}) {
  const config = options.configOverride || loadFareConfig();
  const { vehicleType } = options;

  // --- Distance ---
  const dist = calculateDistance(origin, destination);
  const distanceValue = config.useKilometres ? dist.km : dist.miles;

  // --- Base components ---
  const baseFare = config.baseFare || 0;
  const perUnitRate = config.perKmRate || 0;
  const distanceFare = distanceValue * perUnitRate;

  // --- Multipliers ---
  const surgeMultiplier = config.surgeMultiplier || 1.0;

  const currentHour = new Date().getHours();
  const timeMult = getTimeMultiplier(config.timeMultipliers, currentHour);

  const vehicleMultipliers = config.vehicleTypeMultipliers || {};
  const vehicleMultiplier = vehicleMultipliers[vehicleType] || 1.0;

  // --- Total ---
  const subtotal = (baseFare + distanceFare) * vehicleMultiplier;
  const totalBeforeFloor = subtotal * surgeMultiplier * timeMult.multiplier;
  const minimumFare = config.minimumFare || 0;
  const totalFare = Math.max(totalBeforeFloor, minimumFare);

  return {
    // Distance info
    distanceKm: dist.km,
    distanceMiles: dist.miles,
    distanceDisplay: config.useKilometres
      ? `${dist.km} km`
      : `${dist.miles} mi`,

    // Fare components
    baseFare: round2(baseFare),
    distanceFare: round2(distanceFare),
    surgeMultiplier,
    timeMultiplier: timeMult.multiplier,
    timeLabel: timeMult.label,
    vehicleMultiplier,
    subtotal: round2(subtotal),
    totalFare: round2(totalFare),

    // Currency
    currency: config.currency || 'USD',
    currencySymbol: config.currencySymbol || '$',
    useKilometres: config.useKilometres,
  };
}

/**
 * Round to 2 decimal places
 * @param {number} n
 * @return {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}
