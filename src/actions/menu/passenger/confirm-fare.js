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
import OptionsResponse from '../../../responses/options-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import SubmitOrderResponse from '../../../responses/submit-order/submit-order-response';
import CallActionResponse from '../../../responses/call-action-response';
import If from '../../../responses/if-response';
import Equals from '../../../conditions/equals';
import NotIn from '../../../conditions/not-in';
import Firebase from 'firebase-admin';
import uuid from 'uuid';
import calculateFare from '../../../fare/fare-calculator';

export default class PassengerConfirmFare extends Action {

  constructor(options) {
    super(Object.assign({ type: 'passenger-confirm-fare' }, options));
  }

  get() {
    const origin = this.user.state.location;
    const destination = this.user.state.destinationLocation;

    const fare = calculateFare(origin, destination);

    const pickupLink = origin ? `https://maps.google.com/?q=${origin[0]},${origin[1]}` : '';
    const dropoffLink = destination ? `https://maps.google.com/?q=${destination[0]},${destination[1]}` : '';

    const rideNum = Math.floor(Math.random() * 100) + 1;

    const lines = [];
    lines.push(`Ride #${String(rideNum).padStart(2, '0')} created ✅`);
    lines.push('');
    lines.push(`Estimated distance: ${fare.distanceKm} km`);
    lines.push(`Estimated fare: ~${fare.currencySymbol}${fare.totalFare}`);
    lines.push('');
    lines.push(`Pickup: ${pickupLink}`);
    lines.push(`Drop-off: ${dropoffLink}`);

    return new CompositeResponse()
      .add(new TextResponse({ message: lines.join('\n') }))
      .add(new UserStateResponse({ calculatedFare: fare }))
      .add(new OptionsResponse({
        rows: [
          [{ label: '✅ Confirm', value: 'confirm' }],
          [{ label: '❌ Cancel', value: 'cancel' }],
        ],
      }));
  }

  post(value) {
    return new CompositeResponse()
      .add(new If({
        condition: new Equals(value, 'confirm'),
        ok: this._submitOrder(),
      }))
      .add(new If({
        condition: new Equals(value, 'cancel'),
        ok: new CompositeResponse()
          .add(new TextResponse({ message: '❌ Ride cancelled.' }))
          .add(new RedirectResponse({ path: 'select-user-type' })),
      }))
      .add(new If({
        condition: new NotIn(value, ['confirm', 'cancel']),
        ok: this.get(),
      }));
  }

  _submitOrder() {
    const fare = this.user.state.calculatedFare || {};
    const priceStr = String(fare.totalFare || 0);
    const orderKey = uuid.v4();

    return new CompositeResponse()
      .add(new UserStateResponse({ price: priceStr }))
      .add(new TextResponse({ message: 'Finding nearby drivers now...' }))
      .add(new SubmitOrderResponse({
        orderKey,
        passengerKey: this.user.userKey,
        passengerLocation: this.user.state.location,
        passengerDestination: this.user.state.destination,
        price: priceStr,
        createdAt: Firebase.database.ServerValue.TIMESTAMP,
        requestedVehicleType: 'car',
        calculatedFare: fare,
        destinationLocation: this.user.state.destinationLocation,
      }))
      .add(new CallActionResponse({
        userKey: this.user.userKey,
        route: 'show-message',
        arg: {
          expectedState: {
            menuLocation: 'order-submitted',
            currentOrderKey: orderKey,
          },
          message: 'Seems like you\'ve been waiting for a while? Sorry about that. If you haven\'t found a ride, we recommend trying again later.',
          path: 'select-user-type',
        },
        delay: 20 * 60 * 1000,
      }))
      .add(new TextResponse({ message: '👌 OK!' }))
      .add(new RedirectResponse({ path: 'blank-screen' }));
  }
}
