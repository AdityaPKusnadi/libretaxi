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

import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import RequestLocationResponse from '../../../responses/request-location-response';
import Firebase from 'firebase-admin';

export default class DriverStartTrip extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-start-trip' }, options));
  }

  get() {
    const order = this.user.state.currentOrder || {};
    const fare = order.calculatedFare || {};

    const lines = [];
    lines.push('🚕 Trip Started!');
    lines.push('');
    lines.push(`📏 Distance: ${fare.distanceKm || 0} km`);
    lines.push(`💰 Fare: ${fare.currencySymbol || 'LKR '}${fare.totalFare || 0}`);
    lines.push('');
    lines.push('When you arrive at the destination, tap the 🔴 End Trip button below to share your location and end the trip.');

    return new CompositeResponse()
      .add(new UserStateResponse({
        tripStatus: 'in_progress',
        tripStartedAt: Firebase.database.ServerValue.TIMESTAMP,
      }))
      .add(new TextResponse({ message: lines.join('\n') }))
      .add(new RequestLocationResponse({
        buttonText: '🔴 End Trip 📍',
      }));
  }

  post(value) {
    if (Array.isArray(value)) {
      return new CompositeResponse()
        .add(new UserStateResponse({ tripEndLocation: value }))
        .add(new RedirectResponse({ path: 'driver-end-trip' }));
    }
    return new TextResponse({ message: 'Please share your location to end the trip by tapping the 🔴 End Trip button.' });
  }
}
