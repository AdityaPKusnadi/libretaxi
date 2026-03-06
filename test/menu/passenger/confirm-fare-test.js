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
import routes from '../../../src/routes'; // to avoid circular dependencies
import PassengerConfirmFare from '../../../src/actions/menu/passenger/confirm-fare';
import { i18n } from '../../spec-support';

const user = {
  userKey: 'cli_1',
  state: {
    location: [37.7749, -122.4194],           // San Francisco
    destinationLocation: [37.6879, -122.4702], // ~10 km south
    destination: 'SFO Airport',
    requestedVehicleType: 'car',
  },
};

test('can be constructed with default parameters', t => {
  new PassengerConfirmFare({ i18n, user });
  t.pass();
});

test('should return composite response on get with fare breakdown', t => {
  const action = new PassengerConfirmFare({ i18n, user });
  const response = action.get();
  t.is(response.type, 'composite');

  // Find text response that contains the fare title
  const textMessages = response.responses
    .filter(r => r.type === 'text')
    .map(r => r.message);
  t.truthy(textMessages.length > 0, 'should have text messages');

  // Should have a user-state response saving calculatedFare
  const userStates = response.responses.filter(r => r.type === 'user-state');
  t.truthy(userStates.length > 0, 'should save calculatedFare to state');
  t.truthy(userStates[0].state.calculatedFare, 'calculatedFare should be set');
  t.truthy(userStates[0].state.calculatedFare.totalFare > 0, 'totalFare should be positive');

  // Should have options: accept / custom
  const options = response.responses.filter(r => r.type === 'options');
  t.truthy(options.length > 0, 'should present accept/custom options');
});

test('should submit order when user accepts fare', t => {
  // Pre-set the calculated fare in user state (simulating get() being called first)
  const userWithFare = Object.assign({}, user, {
    state: Object.assign({}, user.state, {
      calculatedFare: {
        totalFare: 15.40,
        currencySymbol: '$',
        distanceDisplay: '10.5 km',
      },
    }),
  });
  const action = new PassengerConfirmFare({ i18n, user: userWithFare });
  const response = action.post('accept');
  t.is(response.type, 'composite');

  // The first If (accept) should produce a composite with order submission
  const ifResponses = response.responses.filter(r => r.type === 'if');
  t.truthy(ifResponses.length > 0, 'should have If responses');

  const acceptIf = ifResponses.find(r => r.condition && r.condition.expected === 'accept');
  t.truthy(acceptIf, 'should have accept condition');
  t.is(acceptIf.ok.type, 'composite');

  // SubmitOrderResponse extends CompositeResponse so its type is 'composite'.
  // Check that the ok branch contains user-state, a nested composite (submit-order),
  // call-action, text, and redirect.
  const types = acceptIf.ok.responses.map(r => r.type);
  t.truthy(types.includes('user-state'), 'should set user state');
  t.truthy(types.includes('composite'), 'should contain SubmitOrderResponse (composite)');
  t.truthy(types.includes('call-action'), 'should schedule timeout');
  t.truthy(types.includes('text'), 'should confirm');
  t.truthy(types.includes('redirect'), 'should redirect');

  // Verify the nested composite is indeed the SubmitOrderResponse (contains save-order)
  const submitComposite = acceptIf.ok.responses.find(r => r.type === 'composite');
  const subTypes = submitComposite.responses.map(r => r.type);
  t.truthy(subTypes.includes('save-order'), 'should save order');
  t.truthy(subTypes.includes('notify-drivers'), 'should notify drivers');
});

test('should redirect to manual price entry when user chooses custom', t => {
  const action = new PassengerConfirmFare({ i18n, user });
  const response = action.post('custom');
  t.is(response.type, 'composite');

  const ifResponses = response.responses.filter(r => r.type === 'if');
  const customIf = ifResponses.find(r => r.condition && r.condition.expected === 'custom');
  t.truthy(customIf, 'should have custom condition');
  t.is(customIf.ok.type, 'composite');

  const redirect = customIf.ok.responses.find(r => r.type === 'redirect');
  t.truthy(redirect, 'should have redirect');
  t.is(redirect.path, 'passenger-request-price');
});
