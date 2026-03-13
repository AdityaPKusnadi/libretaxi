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

import Action from '../../../../action';
import CompositeResponse from '../../../../responses/composite-response';
import TextResponse from '../../../../responses/text-response';
import InterruptPromptResponse from '../../../../responses/interrupt-prompt-response';
import RedirectResponse from '../../../../responses/redirect-response';
import InlineOptionsResponse from '../../../../responses/inline-options-response';
import UserStateResponse from '../../../../responses/user-state-response';
import CallActionResponse from '../../../../responses/call-action-response';
import MetricDistance from '../../../../decorators/distance/metric-distance';
import HistoryHash from '../../../../support/history-hash';

export default class DriverOrderNew extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-order-new' }, options));
  }

  call(args) {
    const response = new CompositeResponse();

    const acceptGuid = `accept_${args.orderKey}_${Date.now()}`;

    const inlineValues = {};
    inlineValues[acceptGuid] = new CallActionResponse({
      userKey: this.user.userKey,
      route: 'driver-accept-ride',
      arg: {
        passengerKey: args.passengerKey || null,
        passengerName: args.passengerName || null,
        orderKey: args.orderKey || null,
        passengerLocation: args.from || null,
        destinationLocation: args.destinationLocation || null,
        calculatedFare: args.calculatedFare || null,
        passengerDestination: args.to || null,
        rideNum: args.rideNum || null,
      },
    });

    const distDisplay = new MetricDistance(this.i18n, args.distance).toString();
    const fare = args.calculatedFare || {};
    const fareDisplay = fare.totalFare
      ? `~${fare.currencySymbol || 'LKR '}${fare.totalFare}`
      : `~${args.price || '0'}`;
    const tripDistance = fare.distanceKm ? `${fare.distanceKm} km` : 'N/A';

    const lines = [];
    lines.push('New Trip Request');
    lines.push('');
    lines.push(`Rider ${distDisplay} away`);
    lines.push(`Estimated distance: ${tripDistance}`);
    lines.push(`Estimated fare: ${fareDisplay}`);

    response
      .add(new InterruptPromptResponse())
      .add(new UserStateResponse({
        inlineValues: new HistoryHash(this.user.state.inlineValues).merge(inlineValues),
      }))
      .add(new TextResponse({ message: lines.join('\n') }))
      .add(new InlineOptionsResponse({
        rows: [
          [{ label: '\u{1F7E1} Accept', value: acceptGuid }],
        ],
        defaultMessage: 'Click to accept this ride',
      }))
      .add(new RedirectResponse({ path: 'driver-index' }));

    return response;
  }
}
