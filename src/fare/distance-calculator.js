import osrmRoute from './osrm-client';
import { getVehicleRate } from './fare-config';
import log from '../log';

const EARTH_RADIUS_KM = 6371;
const KM_TO_MILES = 0.621371;

function toRad(deg) {
  return deg * (Math.PI / 180);
}

export default function calculateDistance(origin, destination) {
  if (!origin || !destination || !Array.isArray(origin) || !Array.isArray(destination)) {
    log.debug('calculateDistance: invalid coordinates, returning 0');
    return { km: 0, miles: 0 };
  }

  const [lat1, lon1] = origin;
  const [lat2, lon2] = destination;

  if (!lat1 || !lon1 || !lat2 || !lon2) {
    log.debug('calculateDistance: null/zero coordinates');
    return { km: 0, miles: 0 };
  }

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = Math.round(EARTH_RADIUS_KM * c * 100) / 100;

  log.debug(`calculateDistance (Haversine): [${lat1},${lon1}] -> [${lat2},${lon2}] = ${km} km`);

  return {
    km,
    miles: Math.round(km * KM_TO_MILES * 100) / 100,
  };
}

export function calculateRoadDistance(origin, destination) {
  log.debug(`calculateRoadDistance: [${origin}] -> [${destination}]`);

  return osrmRoute(origin, destination)
    .then((result) => {
      log.debug(`OSRM road distance: ${result.km} km (${result.durationMinutes} min)`);
      return result;
    })
    .catch((err) => {
      log.debug(`OSRM failed (${err.message}), falling back to Haversine`);
      const fallback = calculateDistance(origin, destination);
      fallback.durationMinutes = null;
      fallback.isEstimate = true;
      return fallback;
    });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function calculateFareFromDistance(distanceKm, vehicleType, options = {}) {
  const rate = options.rateOverride || getVehicleRate(vehicleType || 'car');

  const baseFare = rate.baseFare;
  const baseKm = rate.baseKm;
  const perKmRate = rate.perKmRate;

  let totalFare;
  if (distanceKm <= baseKm) {
    totalFare = baseFare;
  } else {
    totalFare = baseFare + (distanceKm - baseKm) * perKmRate;
  }
  totalFare = round2(totalFare);

  const rateDescription = `First ${baseKm.toFixed(1)} km = ${rate.currencySymbol}${baseFare}, then ${rate.currencySymbol}${perKmRate}/km`;

  log.debug(`FARE_CALC: ${distanceKm} km, vehicle=${vehicleType || 'car'}, base=${baseFare}, perKm=${perKmRate}, total=${totalFare}`);

  return {
    distanceKm,
    baseFare,
    baseKm,
    perKmRate,
    totalFare,
    currency: rate.currency || 'LKR',
    currencySymbol: rate.currencySymbol || 'LKR ',
    rateDescription,
  };
}

export function calculateFareAsync(origin, destination, vehicleType) {
  return calculateRoadDistance(origin, destination)
    .then((dist) => {
      const result = calculateFareFromDistance(dist.km, vehicleType);
      result.distanceKm = dist.km;
      result.distanceMiles = dist.miles;
      result.distanceDisplay = `${dist.km} km`;
      result.durationMinutes = dist.durationMinutes || null;
      result.isEstimate = dist.isEstimate || false;
      return result;
    });
}
