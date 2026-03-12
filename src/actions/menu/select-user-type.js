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

import Action from '../../action';
import OptionsResponse from '../../responses/options-response';
import CompositeResponse from '../../responses/composite-response';
import UserStateResponse from '../../responses/user-state-response';
import TextResponse from '../../responses/text-response';
import RedirectResponse from '../../responses/redirect-response';
import If from '../../responses/if-response';
import Equals from '../../conditions/equals';
import NotIn from '../../conditions/not-in';
import ErrorResponse from '../../responses/error-response';
import loadFareConfig from '../../fare/fare-config';

export default class SelectUserType extends Action {

  constructor(options) {
    super(Object.assign({ type: 'select-user-type' }, options));
  }

  get() {
    const config = loadFareConfig();
    const botName = config.botName || 'Connect';
    const welcomeMsg = config.welcomeMsg
      || `Welcome to ${botName} \u{1F695}\n\nFast and simple taxi service.`;
    return new CompositeResponse()
      .add(new TextResponse({ message: welcomeMsg }))
      .add(new OptionsResponse({
        rows: [
          [{ label: '\u{1F695} Request Ride', value: 'passenger' }],
          [{ label: '\u{1F697} I\'m a Driver', value: 'driver' }],
          [{ label: '\u{1F4CD} Update My Location', value: 'update-location' }],
        ],
      }));
  }

  post(value) {
    return new CompositeResponse()
      .add(new If({
        condition: new Equals(value, 'passenger'),
        ok: this.user.state.phone
          ? new CompositeResponse()
              .add(new UserStateResponse({ userType: 'passenger' }))
              .add(new TextResponse({ message: '\u{1F44C} We\'re all set, you\'re good to order a ride now!' }))
              .add(new RedirectResponse({ path: 'passenger-index' }))
          : new CompositeResponse()
              .add(new UserStateResponse({ userType: 'passenger' }))
              .add(new TextResponse({ message: '\u{1F44C} OK!' }))
              .add(new RedirectResponse({ path: 'request-phone' })),
      }))
      .add(new If({
        condition: new Equals(value, 'driver'),
        ok: (this.user.state.phone && this.user.state.driverName && this.user.state.vehiclePlate)
          ? new CompositeResponse()
              .add(new UserStateResponse({ userType: 'driver' }))
              .add(new TextResponse({ message: '\u{1F44C} Welcome back, driver!' }))
              .add(new RedirectResponse({ path: 'driver-index' }))
          : new CompositeResponse()
              .add(new UserStateResponse({ userType: 'driver' }))
              .add(new TextResponse({ message: '\u{1F44C} OK!' }))
              .add(new RedirectResponse({ path: this.user.state.phone ? 'driver-select-vehicle-type' : 'request-phone' })),
      }))
      .add(new If({
        condition: new Equals(value, 'update-location'),
        ok: new CompositeResponse()
          .add(new TextResponse({ message: '\u{1F44C} OK!' }))
          .add(new RedirectResponse({ path: 'driver-checkin' })),
      }))
      .add(new If({
        condition: new NotIn(value, ['passenger', 'driver', 'update-location']),
        ok: new ErrorResponse({ message: this.gt('error_try_again') }),
      }));
  }
}
