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

import { calculateRoadDistance } from './distance-calculator';
import calculateDistance from './distance-calculator';
import loadFareConfig from './fare-config';

export default function calculateFare(origin, destination, options = {}) {
  const config = options.configOverride || loadFareConfig();

  const dist = calculateDistance(origin, destination);
  const distanceKm = dist.km;

  const baseFare = config.baseFare || 300;
  const baseKm = config.baseKm || 3;
  const perKmRate = config.perKmRate || 100;

  let totalFare;
  if (distanceKm <= baseKm) {
    totalFare = baseFare;
  } else {
    totalFare = baseFare + (distanceKm - baseKm) * perKmRate;
  }

  totalFare = round2(totalFare);

  const rateDescription = `First ${baseKm.toFixed(1)} km = ${config.currencySymbol}${baseFare}, then ${config.currencySymbol}${perKmRate}/km`;

  return {
    distanceKm,
    distanceMiles: dist.miles,
    distanceDisplay: `${distanceKm} km`,
    baseFare,
    baseKm,
    perKmRate,
    totalFare,
    currency: config.currency || 'LKR',
    currencySymbol: config.currencySymbol || 'LKR ',
    rateDescription,
    useKilometres: config.useKilometres,
  };
}

export function calculateFareFromDistance(distanceKm, options = {}) {
  const config = options.configOverride || loadFareConfig();

  const baseFare = config.baseFare || 300;
  const baseKm = config.baseKm || 3;
  const perKmRate = config.perKmRate || 100;

  let totalFare;
  if (distanceKm <= baseKm) {
    totalFare = baseFare;
  } else {
    totalFare = baseFare + (distanceKm - baseKm) * perKmRate;
  }

  totalFare = round2(totalFare);

  const rateDescription = `First ${baseKm.toFixed(1)} km = ${config.currencySymbol}${baseFare}, then ${config.currencySymbol}${perKmRate}/km`;

  return {
    distanceKm,
    baseFare,
    baseKm,
    perKmRate,
    totalFare,
    currency: config.currency || 'LKR',
    currencySymbol: config.currencySymbol || 'LKR ',
    rateDescription,
  };
}

export function calculateFareAsync(origin, destination, options = {}) {
  return calculateRoadDistance(origin, destination)
    .then((dist) => {
      const result = calculateFareFromDistance(dist.km, options);
      result.distanceKm = dist.km;
      result.distanceMiles = dist.miles;
      result.distanceDisplay = `${dist.km} km`;
      result.durationMinutes = dist.durationMinutes || null;
      result.isEstimate = dist.isEstimate || false;
      return result;
    });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
