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

import CaQueue from '../../queue/ca-queue';
import { loadUser } from '../../factories/user-factory';
import log from '../../log';
import firebaseDB from '../../firebase-db';

export default class NotifyDriver {

  constructor(options = {}) {
    this.queue = options.queue || new CaQueue();
    this.failCallback = options.failCallback || (() => {});
    this.successCallback = options.successCallback || (() => {});
    this.loadUser = options.loadUser || loadUser;
  }

  call(driverKey, distance, order) {
    const fail = (reason) => {
      log.debug(`skip notifying ${driverKey} because ${reason}`);
      this.failCallback(reason);
      return;
    };

    if (order.state.status !== 'new') {
      fail('order is not new');
      return;
    }

    if ((new Date()).getTime() > (order.state.createdAt || 0) + 15 * 60 * 1000) {
      fail('order is stale');
      return;
    }

    if (order.isNotified(driverKey)) {
      fail('driver was already notified');
      return;
    }

    this.loadUser(driverKey).then((user) => {
      if (user.state.userType !== 'driver') {
        fail('userType is not \'driver\'');
        return;
      }

      if (user.state.muted) {
        fail('driver is muted');
        return;
      }

      if (user.state.blocked) {
        fail('driver is blocked');
        return;
      }

      if (user.state.vehicleType !== order.state.requestedVehicleType) {
        fail('vehicle types don\'t match');
        return;
      }

      if (user.state.menuLocation !== 'driver-index') {
        fail('driver is busy');
        return;
      }

      if (user.state.tripStatus === 'accepted' || user.state.tripStatus === 'in_progress') {
        fail('driver is on an active trip');
        return;
      }

      if (user.state.pendingOrder) {
        fail('driver already has a pending order');
        return;
      }

      if (distance > user.state.radius * 1) {
        fail(`distance ${distance} is greater than driver's preferred radius ${user.state.radius}`);
        return;
      }

      log.debug(`notifying ${driverKey} (distance ${distance}) about the order`);

      try {
        firebaseDB.config().ref(`users/${driverKey}/pendingOrder`).set(order.orderKey);
      } catch (e) {
        log.debug(`error setting pendingOrder for ${driverKey}: ${e}`);
      }

      const arg = {
        orderKey: order.orderKey,
        distance,
        from: order.state.passengerLocation,
        to: order.state.passengerDestination,
        price: order.state.price,
        passengerKey: order.state.passengerKey,
        passengerName: order.state.passengerName || null,
        calculatedFare: order.state.calculatedFare || null,
        destinationLocation: order.state.destinationLocation || null,
        rideNum: order.state.rideNum || null,
      };
      this.queue.create({ userKey: driverKey, arg, route: 'driver-order-new' });

      order.markNotified(driverKey);
      order.save();
      this.successCallback();
    });
  }
}
