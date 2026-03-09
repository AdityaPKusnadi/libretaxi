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
import PassengerRequestDestinationLocation from
  '../../../src/actions/menu/passenger/request-destination-location';
import { i18n } from '../../spec-support';

const user = {
  userKey: 'cli_1',
  state: {},
};

test('can be constructed with default parameters', t => {
  new PassengerRequestDestinationLocation({ i18n, user });
  t.pass();
});

test('should return composite response on get', t => {
  const action = new PassengerRequestDestinationLocation({ i18n, user });
  const response = action.get();
  t.is(response.type, 'composite');
  t.is(response.responses[0].type, 'text');
  t.truthy(response.responses[0].message.length > 0);
  t.is(response.responses[1].type, 'request-location');
  t.truthy(response.responses[1].extraRows);
  t.is(response.responses[1].extraRows.length, 1);
});

test('should redirect to request-price when skipped', t => {
  const action = new PassengerRequestDestinationLocation({ i18n, user });
  const response = action.post('skip');
  t.is(response.type, 'composite');
  t.is(response.responses[0].type, 'text');
  t.is(response.responses[0].message, '👌 OK!');
  t.is(response.responses[1].type, 'redirect');
  t.is(response.responses[1].path, 'passenger-request-price');
});

test('should redirect to request-price when skip label text is sent', t => {
  const action = new PassengerRequestDestinationLocation({ i18n, user });
  // On Telegram the full button label text is sent, not just 'skip'
  const skipLabel = action.t('skip');
  const response = action.post(skipLabel);
  t.is(response.type, 'composite');
  t.is(response.responses[0].type, 'text');
  t.is(response.responses[0].message, '👌 OK!');
  t.is(response.responses[1].type, 'redirect');
  t.is(response.responses[1].path, 'passenger-request-price');
});

test('should save location and redirect to confirm-fare on valid GPS', t => {
  const action = new PassengerRequestDestinationLocation({ i18n, user });
  const response = action.post([37.7749, -122.4194]);
  t.is(response.type, 'if');
  // The ok branch should be a composite with user-state + text + redirect
  t.is(response.ok.type, 'composite');
  t.is(response.ok.responses[0].type, 'user-state');
  t.deepEqual(response.ok.responses[0].state.destinationLocation, [37.7749, -122.4194]);
  t.is(response.ok.responses[2].type, 'redirect');
  t.is(response.ok.responses[2].path, 'passenger-confirm-fare');
});

test('should show error on invalid location', t => {
  const action = new PassengerRequestDestinationLocation({ i18n, user });
  const response = action.post('invalid_location');
  t.is(response.type, 'if');
  // err branch should redirect back to same action
  t.is(response.err.type, 'composite');
  t.is(response.err.responses[0].type, 'error');
  t.is(response.err.responses[1].type, 'redirect');
  t.is(response.err.responses[1].path, 'passenger-request-destination-location');
});
