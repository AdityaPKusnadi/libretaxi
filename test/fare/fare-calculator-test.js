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

/* eslint-disable no-new, no-unused-vars */
import test from 'ava';
import calculateFare, { getTimeMultiplier } from '../../src/fare/fare-calculator';

// A config override for deterministic testing (no file I/O)
const testConfig = {
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

// --- getTimeMultiplier ---

test('getTimeMultiplier should return 1.0 when no windows defined', t => {
  const result = getTimeMultiplier([], 12);
  t.is(result.multiplier, 1.0);
  t.is(result.label, null);
});

test('getTimeMultiplier should match a daytime window', t => {
  const windows = [
    { startHour: 7, endHour: 9, multiplier: 1.2, label: 'Morning rush' },
  ];
  t.is(getTimeMultiplier(windows, 8).multiplier, 1.2);
  t.is(getTimeMultiplier(windows, 8).label, 'Morning rush');
  t.is(getTimeMultiplier(windows, 10).multiplier, 1.0);
});

test('getTimeMultiplier should match an overnight window', t => {
  const windows = [
    { startHour: 22, endHour: 6, multiplier: 1.3, label: 'Night surcharge' },
  ];
  t.is(getTimeMultiplier(windows, 23).multiplier, 1.3);
  t.is(getTimeMultiplier(windows, 3).multiplier, 1.3);
  t.is(getTimeMultiplier(windows, 12).multiplier, 1.0);
});

test('getTimeMultiplier should handle null/undefined gracefully', t => {
  t.is(getTimeMultiplier(null, 5).multiplier, 1.0);
  t.is(getTimeMultiplier(undefined, 5).multiplier, 1.0);
});

// --- calculateFare ---

test('should calculate fare for a ~10 km trip', t => {
  const origin = [37.7749, -122.4194]; // San Francisco
  const dest = [37.6879, -122.4702];   // ~10 km south
  const fare = calculateFare(origin, dest, {
    vehicleType: 'car',
    configOverride: testConfig,
  });

  t.truthy(fare.distanceKm > 5, 'should have meaningful distance');
  t.is(fare.baseFare, 2.50);
  t.true(fare.distanceFare > 0, 'distance fare should be positive');
  t.true(fare.totalFare >= 5.00, 'total should be at least minimum fare');
  t.is(fare.currency, 'USD');
  t.is(fare.currencySymbol, '$');
});

test('should apply minimum fare for very short trips', t => {
  // Two points very close together (< 1 km)
  const origin = [40.748817, -73.985428];
  const dest = [40.749000, -73.985500];
  const fare = calculateFare(origin, dest, {
    vehicleType: 'car',
    configOverride: testConfig,
  });

  // baseFare(2.50) + tiny distance ≈ 2.52, below minimum of 5.00
  t.is(fare.totalFare, 5.00, 'should enforce minimum fare');
});

test('should apply motorbike multiplier', t => {
  const origin = [37.7749, -122.4194];
  const dest = [37.6879, -122.4702];
  const carFare = calculateFare(origin, dest, {
    vehicleType: 'car',
    configOverride: testConfig,
  });
  const bikeFare = calculateFare(origin, dest, {
    vehicleType: 'motorbike',
    configOverride: testConfig,
  });

  t.true(bikeFare.totalFare < carFare.totalFare,
    'motorbike fare should be cheaper');
  t.is(bikeFare.vehicleMultiplier, 0.7);
});

test('should apply surge multiplier', t => {
  const surgeConfig = Object.assign({}, testConfig, { surgeMultiplier: 2.0 });
  const origin = [37.7749, -122.4194];
  const dest = [37.6879, -122.4702];

  const normal = calculateFare(origin, dest, {
    vehicleType: 'car',
    configOverride: testConfig,
  });
  const surged = calculateFare(origin, dest, {
    vehicleType: 'car',
    configOverride: surgeConfig,
  });

  // Surge should roughly double the fare (unless minimum kicks in)
  t.true(surged.totalFare > normal.totalFare, 'surged fare should be higher');
  t.is(surged.surgeMultiplier, 2.0);
});

test('should include distance display string', t => {
  const fare = calculateFare([0, 0], [1, 1], {
    vehicleType: 'car',
    configOverride: testConfig,
  });
  t.truthy(fare.distanceDisplay.includes('km'));
});

test('should use miles when configured', t => {
  const milesConfig = Object.assign({}, testConfig, { useKilometres: false });
  const fare = calculateFare([0, 0], [1, 1], {
    vehicleType: 'car',
    configOverride: milesConfig,
  });
  t.truthy(fare.distanceDisplay.includes('mi'));
});

test('should return all expected properties', t => {
  const fare = calculateFare([0, 0], [1, 1], {
    vehicleType: 'car',
    configOverride: testConfig,
  });

  const expectedKeys = [
    'distanceKm', 'distanceMiles', 'distanceDisplay',
    'baseFare', 'distanceFare', 'surgeMultiplier',
    'timeMultiplier', 'timeLabel', 'vehicleMultiplier',
    'subtotal', 'totalFare', 'currency', 'currencySymbol', 'useKilometres',
  ];
  for (const key of expectedKeys) {
    t.true(key in fare, `missing property: ${key}`);
  }
});
