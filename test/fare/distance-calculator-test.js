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
import calculateDistance from '../../src/fare/distance-calculator';

test('should calculate zero distance for same point', t => {
  const result = calculateDistance([37.7749, -122.4194], [37.7749, -122.4194]);
  t.is(result.km, 0);
  t.is(result.miles, 0);
});

test('should calculate distance between SF and LA correctly', t => {
  // San Francisco to Los Angeles ≈ 559 km
  const sf = [37.7749, -122.4194];
  const la = [34.0522, -118.2437];
  const result = calculateDistance(sf, la);
  // Allow a tolerance of ±10 km for the Haversine approximation
  t.true(result.km > 540 && result.km < 570, `Expected ~559 km, got ${result.km}`);
  t.true(result.miles > 335 && result.miles < 355, `Expected ~347 miles, got ${result.miles}`);
});

test('should calculate short distance accurately', t => {
  // About 1 km apart in NYC
  const a = [40.748817, -73.985428]; // Empire State Building
  const b = [40.758896, -73.985130]; // Times Square
  const result = calculateDistance(a, b);
  t.true(result.km > 0.9 && result.km < 1.5, `Expected ~1.1 km, got ${result.km}`);
});

test('should return km and miles properties', t => {
  const result = calculateDistance([0, 0], [1, 1]);
  t.truthy(typeof result.km === 'number');
  t.truthy(typeof result.miles === 'number');
  t.true(result.miles < result.km, 'miles should be less than km');
});
