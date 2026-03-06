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

/**
 * Passenger confirm fare menu action.
 *
 * Calculates the fare automatically from the rider's origin and destination
 * GPS coordinates, displays a clear breakdown, and lets the rider either
 * accept the calculated price or enter a custom one.
 *
 * This action reads fare-config.json on every invocation so that config
 * changes take effect immediately.
 *
 * @author LibreTaxi contributors
 * @date 2026-03-06
 * @version 1.0
 * @since 0.1.0
 */
export default class PassengerConfirmFare extends Action {

  /**
   * Constructor.
   */
  constructor(options) {
    super(Object.assign({ type: 'passenger-confirm-fare' }, options));
  }

  /**
   * Calculate fare and present the breakdown to the rider.
   *
   * @return {CompositeResponse}
   */
  get() {
    const origin = this.user.state.location;
    const destination = this.user.state.destinationLocation;
    const vehicleType = this.user.state.requestedVehicleType || 'car';

    // Calculate fare using current config
    const fare = calculateFare(origin, destination, { vehicleType });

    // Build a human-readable breakdown
    const lines = [];
    lines.push(this.t('fare_title'));
    lines.push(this.t('distance_line', fare.distanceDisplay));
    lines.push(this.t('base_fare_line',
      `${fare.currencySymbol}${fare.baseFare.toFixed(2)}`));
    lines.push(this.t('distance_fare_line',
      `${fare.currencySymbol}${fare.distanceFare.toFixed(2)}`));

    if (fare.vehicleMultiplier !== 1.0) {
      lines.push(this.t('vehicle_multiplier_line',
        `${vehicleType} x${fare.vehicleMultiplier}`));
    }
    if (fare.surgeMultiplier !== 1.0) {
      lines.push(this.t('surge_line', `x${fare.surgeMultiplier}`));
    }
    if (fare.timeMultiplier !== 1.0 && fare.timeLabel) {
      lines.push(this.t('time_line',
        `${fare.timeLabel} x${fare.timeMultiplier}`));
    }

    lines.push('─────────────');
    lines.push(this.t('total_line',
      `${fare.currencySymbol}${fare.totalFare.toFixed(2)} ${fare.currency}`));

    return new CompositeResponse()
      .add(new TextResponse({ message: lines.join('\n') }))
      .add(new UserStateResponse({ calculatedFare: fare }))
      .add(new OptionsResponse({
        rows: [
          [{ label: this.t('accept'), value: 'accept' }],
          [{ label: this.t('custom_price'), value: 'custom' }],
        ],
        defaultMessage: this.gt('default_options_message'),
      }));
  }

  /**
   * Handle the rider's choice.
   *
   * @param {string} value - 'accept' | 'custom'
   * @return {CompositeResponse|If}
   */
  post(value) {
    return new CompositeResponse()
      .add(new If({
        condition: new Equals(value, 'accept'),
        ok: this._submitWithCalculatedFare(),
      }))
      .add(new If({
        condition: new Equals(value, 'custom'),
        ok: new CompositeResponse()
          .add(new TextResponse({ message: '👌 OK!' }))
          .add(new RedirectResponse({ path: 'passenger-request-price' })),
      }))
      .add(new If({
        condition: new NotIn(value, ['accept', 'custom']),
        ok: this.get(),
      }));
  }

  /**
   * Build the response chain that submits the order using the auto-calculated fare.
   * Mirrors the logic in PassengerRequestPrice.post() so the downstream flow
   * is identical.
   *
   * @private
   * @return {CompositeResponse}
   */
  _submitWithCalculatedFare() {
    const fare = this.user.state.calculatedFare || {};
    const priceStr = String(fare.totalFare || 0);
    const orderKey = uuid.v4();

    return new CompositeResponse()
      .add(new UserStateResponse({ price: priceStr }))
      .add(new SubmitOrderResponse({
        orderKey,
        passengerKey: this.user.userKey,
        passengerLocation: this.user.state.location,
        passengerDestination: this.user.state.destination,
        price: priceStr,
        createdAt: Firebase.database.ServerValue.TIMESTAMP,
        requestedVehicleType: this.user.state.requestedVehicleType,
        // Extra fields for the fare feature
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
          message: this.t('on_timeout'),
          path: 'passenger-index',
        },
        delay: 20 * 60 * 1000,
      }))
      .add(new TextResponse({ message: '👌 OK!' }))
      .add(new RedirectResponse({ path: 'blank-screen' }));
  }
}
