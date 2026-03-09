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

export default class SelectUserType extends Action {

  constructor(options) {
    super(Object.assign({ type: 'select-user-type' }, options));
  }

  get() {
    return new CompositeResponse()
      .add(new TextResponse({ message: 'Welcome to Connect 🚕\n\nFast and simple taxi service in Sri Lanka.' }))
      .add(new OptionsResponse({
        rows: [
          [{ label: '🚕 Request Ride', value: 'passenger' }],
          [{ label: '🚗 I\'m a Driver', value: 'driver' }],
          [{ label: '📍 Update My Location', value: 'update-location' }],
        ],
      }));
  }

  post(value) {
    return new CompositeResponse()
      .add(new If({
        condition: new Equals(value, 'passenger'),
        ok: new CompositeResponse()
          .add(new UserStateResponse({ userType: 'passenger' }))
          .add(new TextResponse({ message: '👌 OK!' }))
          .add(new RedirectResponse({ path: 'request-phone' })),
      }))
      .add(new If({
        condition: new Equals(value, 'driver'),
        ok: new CompositeResponse()
          .add(new UserStateResponse({ userType: 'driver' }))
          .add(new TextResponse({ message: '👌 OK!' }))
          .add(new RedirectResponse({ path: 'request-phone' })),
      }))
      .add(new If({
        condition: new Equals(value, 'update-location'),
        ok: new CompositeResponse()
          .add(new TextResponse({ message: '👌 OK!' }))
          .add(new RedirectResponse({ path: 'driver-checkin' })),
      }))
      .add(new If({
        condition: new NotIn(value, ['passenger', 'driver', 'update-location']),
        ok: new ErrorResponse({ message: this.gt('error_try_again') }),
      }));
  }
}
