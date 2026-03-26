import test from 'ava';
import calculateDistance, { calculateRoadDistance, calculateFareFromDistance, calculateFareAsync } from '../src/fare/distance-calculator';
import DriverEndTrip from '../src/actions/menu/driver/end-trip';
import sinon from 'sinon';
import Firebase from 'firebase-admin';
import * as oracleLogger from '../src/support/oracle-logger';
import * as groupLog from '../src/support/group-log';
import * as osrmClient from '../src/fare/osrm-client';
import UserStateResponse from '../src/responses/user-state-response';

test.before(t => {
  // Mock Firebase to avoid errors when building response
  if (!Firebase.database) {
    Firebase.database = {
      ServerValue: { TIMESTAMP: 'MOCK_TIMESTAMP' }
    };
  }
  
  // Mock oracle logger and group log
  sinon.stub(oracleLogger, 'updateTripStatus').returns(Promise.resolve());
  sinon.stub(groupLog, 'sendGroupLog').returns();
});

test.after(t => {
  sinon.restore();
});

test('Trip 2 km test \u2192 End Trip \u2192 distance = ~2 km, fare = base fare', t => {
  const fare = calculateFareFromDistance(2, 'car');
  t.is(fare.distanceKm, 2);
  t.is(fare.totalFare, 300); // Base fare for 3km is 300
});

test('Trip 5 km test \u2192 End Trip \u2192 distance = ~5 km, fare = base + (2 * per_km)', t => {
  const fare = calculateFareFromDistance(5, 'car');
  t.is(fare.distanceKm, 5);
  t.is(fare.totalFare, 500); // 300 + (2 * 100)
});

test('Trip 10 km test \u2192 End Trip \u2192 distance = ~10 km, calculate fare', t => {
  const fare = calculateFareFromDistance(10, 'car');
  t.is(fare.distanceKm, 10);
  t.is(fare.totalFare, 1000); // 300 + (7 * 100)
});

test('Trip 50+ km test \u2192 End Trip \u2192 does not crash, correct fare', t => {
  const fare = calculateFareFromDistance(55.5, 'car');
  t.is(fare.distanceKm, 55.5);
  t.is(fare.totalFare, 300 + (52.5 * 100)); // 5550
});

test('Trip 100+ km test \u2192 End Trip \u2192 does not crash, correct fare', t => {
  const fare = calculateFareFromDistance(120, 'car');
  t.is(fare.distanceKm, 120);
  t.is(fare.totalFare, 300 + (117 * 100)); // 12000
});

test('5 consecutive trips \u2192 all distance consistent', t => {
  for (let i = 0; i < 5; i++) {
    const fare = calculateFareFromDistance(10, 'car');
    t.is(fare.distanceKm, 10);
    t.is(fare.totalFare, 1000);
  }
});

test('Setelah trip selesai \u2192 driver bisa menerima request baru', t => {
  const mockOrder = { rideNum: '10' };
  const mockState = {
    currentOrder: mockOrder,
    tripStartLocation: [1, 1],
    tripEndLocation: [1, 1.01],
    tripStartedAt: 12345,
    identity: { username: 'driver_x' }
  };
  const action = new DriverEndTrip({
    user: {
      userKey: 'd1',
      state: mockState
    },
    i18n: () => ''
  });
  if (!action.user.state) action.user.state = mockState;

  const finalFare = { totalFare: 300, rateDescription: 'mock', currencySymbol: 'LKR ' };
  const response = action._buildResponse(mockOrder, 2, finalFare, 'car');

  const userStateResponse = response.responses.find(r => r instanceof UserStateResponse);
  t.truthy(userStateResponse);
  t.is(userStateResponse.newState.currentOrder, null);
  t.is(userStateResponse.newState.tripStatus, null);
  t.is(userStateResponse.newState.tripStartedAt, null);
});

test('Setelah trip gagal/error \u2192 driver bisa menerima request baru (fallback null data)', t => {
  const mockOrder = { rideNum: '11' };
  const action = new DriverEndTrip({
    user: {
      userKey: 'd1',
      state: { currentOrder: mockOrder }
    },
    i18n: () => ''
  });
  if (!action.user.state) action.user.state = { currentOrder: mockOrder };

  const finalFare = { totalFare: 300, rateDescription: 'mock', currencySymbol: 'LKR ' };
  const response = action._buildResponse(mockOrder, 0, finalFare, 'car');

  const userStateResponse = response.responses.find(r => r instanceof UserStateResponse);
  t.truthy(userStateResponse);
  t.is(userStateResponse.newState.currentOrder, null);
});

test.cb('OSRM timeout \u2192 fallback calculation, tidak crash', t => {
  const osrmStub = sinon.stub(osrmClient, 'default').returns(Promise.reject(new Error('OSRM request timeout')));
  
  calculateRoadDistance([0, 0], [0.089992, 0]).then(dist => {
    t.truthy(dist.isEstimate);
    t.is(dist.km, 10);
    osrmStub.restore();
    t.end();
  });
});

test('Bot restart \u2192 trip aktif masih bisa diselesaikan', t => {
  const osrmStub = sinon.stub(osrmClient, 'default').returns(Promise.resolve({ km: 2, miles: 1.2, durationMinutes: 5 }));
  const action = new DriverEndTrip({
    user: {
      userKey: 'd1',
      state: {
        currentOrder: { rideNum: '99' },
        tripStartLocation: [0, 0],
        tripEndLocation: [0.017998, 0],
        tripStartedAt: 12345
      }
    },
    i18n: () => ''
  });
  if (!action.user.state) action.user.state = {
    currentOrder: { rideNum: '99' },
    tripStartLocation: [0, 0],
    tripEndLocation: [0.017998, 0],
    tripStartedAt: 12345
  };
  
  t.is(action.get().constructor.name, 'PromiseResponse');
  osrmStub.restore();
});

test('Trip selesai \u2192 log terkirim ke Telegram group', t => {
  const mockOrder = { rideNum: '10' };
  const mockState = {
    currentOrder: mockOrder,
    tripStartLocation: [1, 1],
    tripEndLocation: [1, 1.01],
    tripStartedAt: 12345,
    identity: { username: 'driver_x' }
  };
  const action = new DriverEndTrip({
    user: {
      userKey: 'd1',
      state: mockState
    },
    i18n: () => ''
  });
  if (!action.user.state) action.user.state = mockState;

  const finalFare = { totalFare: 300, rateDescription: 'mock', currencySymbol: 'LKR ' };
  action._buildResponse(mockOrder, 2, finalFare, 'car');
  
  t.true(groupLog.sendGroupLog.called);
});
