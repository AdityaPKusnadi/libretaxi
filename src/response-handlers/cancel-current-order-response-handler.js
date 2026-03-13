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

import ResponseHandler from './response-handler';
import Order from '../order';
import CaQueue from '../queue/ca-queue';
import firebaseDB from '../firebase-db';
import { updateTripStatus } from '../support/oracle-logger';
import { sendGroupLog, formatDate } from '../support/group-log';

export default class CancelCurrentOrderResponseHandler extends ResponseHandler {

  constructor(options) {
    super(Object.assign({ type: 'cancel-current-order-response-handler' }, options));
    this.queue = new CaQueue();
  }

  call(onResult) {
    const orderKey = this.user.state.currentOrderKey;
    const rideNum = this.user.state.rideNum || null;
    const fare = this.user.state.calculatedFare || {};
    const vehicleType = this.user.state.requestedVehicleType || 'car';

    new Order({ orderKey }).load().then((order) => {
      if (order.status !== 'cancelled') {
        order.setState({ status: 'cancelled' });
        order.save(() => {
          const assignedDriver = order.state.assignedDriver || null;
          if (assignedDriver) {
            firebaseDB.config().ref(`users/${assignedDriver}`).update({
              pendingOrder: null,
              currentOrder: null,
              tripStatus: null,
              menuLocation: 'driver-index',
            });
            this.queue.create({
              userKey: assignedDriver,
              arg: {
                expectedState: {},
                message: '\u274C Rider has cancelled the ride. You are now available for new rides.',
                path: 'driver-index',
              },
              route: 'show-message',
            });
          }

          if (rideNum) {
            updateTripStatus(rideNum, { status: 'cancelled' }).catch(() => {});

            const riderName = (this.user.state.identity && this.user.state.identity.username)
              ? `@${this.user.state.identity.username}`
              : (this.user.state.identity && this.user.state.identity.first) || 'Rider';
            const groupLines = [
              `\u274C Connect \u2014 Ride #${rideNum} Cancelled`,
              '',
              `\u{1F464} Rider: ${riderName}`,
              `\u{1F4CF} Est. Distance: ${fare.distanceKm || 0} km`,
              `\u{1F4B0} Est. Fare: ${fare.currencySymbol || 'LKR '}${fare.totalFare || 0}`,
              `\u{1F697} Vehicle: ${vehicleType}`,
              '',
              formatDate(),
            ];
            sendGroupLog(groupLines.join('\n'));
          }

          this.informPassenger(this.user.userKey);
          onResult();
        });
      } else {
        onResult();
      }
    })
    .catch((err) => {
      console.log(`Error in CancelCurrentOrderResponseHandler ${err}`);
    });
  }

  informPassenger(userKey) {
    this.queue.redirect({ userKey, route: 'order-cancelled' });
  }
}
