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
import RedirectResponse from '../../../responses/redirect-response';
import UserStateResponse from '../../../responses/user-state-response';
import If from '../../../responses/if-response';
import Location from '../../../conditions/location';
import ErrorResponse from '../../../responses/error-response';
import RequestUserInputResponse from '../../../responses/request-user-input-response';

/**
 * Passenger request destination location menu action.
 *
 * Asks the passenger to share the GPS coordinates of their destination so
 * that the fare can be calculated automatically.  The rider can also skip
 * this step and enter a price manually.
 *
 * @author LibreTaxi contributors
 * @date 2026-03-06
 * @version 1.0
 * @since 0.1.0
 */
export default class PassengerRequestDestinationLocation extends Action {

  /**
   * Constructor.
   */
  constructor(options) {
    super(Object.assign({ type: 'passenger-request-destination-location' }, options));
  }

  /**
   * Display a prompt asking for destination coordinates or to skip.
   *
   * @return {CompositeResponse}
   */
  get() {
    return new CompositeResponse()
      .add(new TextResponse({ message: '🏁 Where is your destination?\n\nType the address or place name below.\nExample: Monas Jakarta, Bandung Station\n\nOr tap the 📎 attachment button → Location → search and pin your destination on the map.' }))
      .add(new RequestUserInputResponse());
  }

  /**
   * Handle user input: GPS coordinates or "skip".
   *
   * @param {Array|string} value - [lat, lng] array or "skip"
   * @return {CompositeResponse|If}
   */
  post(value) {
    return new If({
      condition: new Location(value),
      ok: new CompositeResponse()
        .add(new UserStateResponse({ destinationLocation: value }))
        .add(new TextResponse({ message: '👌 OK!' }))
        .add(new RedirectResponse({ path: 'passenger-confirm-fare' })),
      err: new CompositeResponse()
        .add(new ErrorResponse({ message: this.gt('error_location') }))
        .add(this.get()),
    });
  }
}
