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
import CallActionResponse from '../../../responses/call-action-response';
import { calculateFareFromDistance } from '../../../fare/fare-calculator';
import calculateDistance from '../../../fare/distance-calculator';
import Firebase from 'firebase-admin';
import firebaseDB from '../../../firebase-db';
import { logTripToOracle } from '../../../support/oracle-logger';

export default class DriverEndTrip extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-end-trip' }, options));
  }

  get() {
    const order = this.user.state.currentOrder || {};
    const fare = order.calculatedFare || {};
    const pickup = order.passengerLocation;
    const dropoff = order.destinationLocation;
    const endLocation = this.user.state.tripEndLocation;

    let distanceKm = fare.distanceKm || 0;
    let finalFare = fare;
    const tripStarted = !!this.user.state.tripStartedAt;

    if (!tripStarted) {
      distanceKm = 0;
      finalFare = calculateFareFromDistance(0);
    } else if (pickup && endLocation) {
      const dist = calculateDistance(pickup, endLocation);
      distanceKm = dist.km;
      finalFare = calculateFareFromDistance(distanceKm);
    } else if (pickup && dropoff) {
      const dist = calculateDistance(pickup, dropoff);
      distanceKm = dist.km;
      finalFare = calculateFareFromDistance(distanceKm);
    }

    const riderName = order.passengerName || 'Rider';
    const driverPhone = this.user.state.phone || 'N/A';
    const driverUsername = this.user.state.identity
      ? `@${this.user.state.identity.username || 'driver'}`
      : driverPhone;

    const rateDesc = finalFare.rateDescription || `First 3.0 km = LKR 300, then LKR 100/km`;

    const passengerSummaryLines = [];
    passengerSummaryLines.push('\u2705 Trip Completed!');
    passengerSummaryLines.push('');
    passengerSummaryLines.push(`\u{1F4CF} Distance: ${distanceKm} km`);
    passengerSummaryLines.push(`\u{1F4B0} Final Fare: ${finalFare.currencySymbol || 'LKR '}${finalFare.totalFare || 0}`);

    const driverSummaryLines = [];
    driverSummaryLines.push('✅ Connect — Trip Completed!');
    driverSummaryLines.push('');
    driverSummaryLines.push(`👤 Rider: ${riderName}`);
    driverSummaryLines.push(`🚘 Driver: ${driverUsername}`);
    driverSummaryLines.push(`📏 Distance: ${distanceKm} km`);
    driverSummaryLines.push(`💵 Rate: ${rateDesc}`);
    driverSummaryLines.push(`💰 Total Fare: ${finalFare.currencySymbol || 'LKR '}${finalFare.totalFare || 0}`);
    driverSummaryLines.push('');
    driverSummaryLines.push('Thank you for using Connect!');

    const passengerSummaryMessage = passengerSummaryLines.join('\n');
    const driverSummaryMessage = driverSummaryLines.join('\n');

    const response = new CompositeResponse();

    response.add(new UserStateResponse({
      tripStatus: null,
      tripCompletedAt: Firebase.database.ServerValue.TIMESTAMP,
      tripDistance: distanceKm,
      tripFare: finalFare.totalFare,
      currentOrder: null,
      passengerProceeded: null,
      driverKey: null,
      pendingOrder: null,
      driverArrived: null,
    }));

    response.add(new TextResponse({ message: driverSummaryMessage }));

    if (order.passengerKey) {
      response.add(new CallActionResponse({
        userKey: order.passengerKey,
        route: 'show-message',
        arg: {
          expectedState: {},
          message: passengerSummaryMessage,
          path: 'passenger-rate-driver',
        },
      }));
    }

    response.add(new RedirectResponse({ path: 'driver-index' }));

    try {
      // Log to Oracle DB
      logTripToOracle({
        passengerName: riderName,
        driverName: driverUsername,
        driverPhone: driverPhone,
        tripDistance: distanceKm,
        tripFare: finalFare.totalFare || 0,
        rateDescription: rateDesc
      });
    } catch (e) {
      console.log(`Error saving trip to Oracle: ${e}`);
    }

    return response;
  }

  post() {
    return this.get();
  }
}
