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
import InterruptPromptResponse from '../../../responses/interrupt-prompt-response';
import RequestUserInputResponse from '../../../responses/request-user-input-response';
import OptionsResponse from '../../../responses/options-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import CallActionResponse from '../../../responses/call-action-response';
import MapResponse from '../../../responses/map-response';
import If from '../../../responses/if-response';
import Equals from '../../../conditions/equals';
import NotIn from '../../../conditions/not-in';
import Order from '../../../order';

export default class DriverAcceptRide extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-accept-ride' }, options));
  }

  call(args) {
    if (args && args.showLocations) {
      this.user.state.passengerProceeded = true;
      return new CompositeResponse()
        .add(new InterruptPromptResponse())
        .add(new UserStateResponse({ passengerProceeded: true }))
        .add(this._showLocations());
    }

    if (args && args.orderKey) {
      this.user.state.currentOrder = args;
      
      const distanceKm = args.calculatedFare ? args.calculatedFare.distanceKm : 'N/A';
      const fareFormat = args.calculatedFare ? `${args.calculatedFare.currencySymbol || 'LKR '}${args.calculatedFare.totalFare}` : 'N/A';
      const rideNumDisplay = args.rideNum ? args.rideNum : '##';

      new Order({ orderKey: args.orderKey }).load().then((order) => {
        order.setState({ status: 'accepted' });
        order.save();
      }).catch(() => {});
      
      return new CompositeResponse()
        .add(new CallActionResponse({
          userKey: args.passengerKey,
          route: 'passenger-ride-accepted',
          arg: {
            distanceKm,
            fareFormat,
            rideNumDisplay,
            driverPhone: this.user.state.phone || 'N/A',
            driverKey: this.user.userKey,
          },
        }))
        .add(new UserStateResponse({ 
          currentOrder: args,
          menuLocation: 'driver-accept-ride',
          tripStatus: 'accepted',
          passengerProceeded: false,
          pendingOrder: null,
        }))
        .add(new TextResponse({ message: '\u2705 Ride accepted!\n\nWaiting for rider to confirm...' }))
        .add(new RequestUserInputResponse());
    }

    return super.call(args);
  }

  get() {
    if (!this.user.state.passengerProceeded) {
      return new CompositeResponse()
        .add(new TextResponse({ message: '✅ Ride accepted!\n\nWaiting for rider to confirm...' }))
        .add(new RequestUserInputResponse());
    }
    return this._showLocations();
  }

  _showLocations() {
    const order = this.user.state.currentOrder || {};
    const phone = this.user.state.phone || 'N/A';
    const pickup = order.passengerLocation;
    const dropoff = order.destinationLocation;
    const fare = order.calculatedFare || {};

    const response = new CompositeResponse();

    response.add(new TextResponse({
      message: `📍 Pickup and 🏁 Drop-off locations\nare shared below.\n\nTap on the locations to open in Google Maps and navigate.`,
    }));

    response.add(new TextResponse({ message: `📍 PICKUP location:` }));
    if (pickup) {
      response.add(new MapResponse({ location: pickup }));
    }

    response.add(new TextResponse({ message: `🏁 DROP-OFF location:` }));
    if (dropoff) {
      response.add(new MapResponse({ location: dropoff }));
    }

    response.add(new TextResponse({
      message: `When you reach the rider and are ready to go, tap Start Trip:`,
    }));

    response.add(new OptionsResponse({
      rows: [
        [{ label: '🟢 Start Trip', value: 'start-trip' }],
      ],
    }));

    return response;
  }

  post(value) {
    // If the value contains 'Start Trip' or 'start-trip' anywhere in the string, consider it a match
    const isStartTrip = (value && typeof value === 'string' && 
                         (value.includes('start-trip') || value.includes('Start Trip')));

    if (isStartTrip) {
      return new CompositeResponse()
        .add(new TextResponse({ message: '👌 OK!' }))
        .add(new RedirectResponse({ path: 'driver-start-trip' }));
    }

    // Default fallback: Redraw the UI
    return new CompositeResponse()
      .add(new RedirectResponse({ path: 'driver-accept-ride' }));
  }
}
