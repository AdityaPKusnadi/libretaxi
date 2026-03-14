import osrmRoute from './osrm-client';
import { getVehicleRate } from './fare-config';

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
