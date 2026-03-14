import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import OptionsResponse from '../../../responses/options-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import { isCategoryBlocked } from '../../../fare/fare-config';

const VEHICLES = [
  { key: 'car',  label: '\u{1F697} Car (3\u20134 Seats)',  emoji: '\u{1F697}', name: 'Car' },
  { key: 'tuk',  label: '\u{1F6FA} Tuk (2\u20133 Seats)',  emoji: '\u{1F6FA}', name: 'Tuk' },
  { key: 'bike', label: '\u{1F3CD}\uFE0F Bike (1 Seat)',  emoji: '\u{1F3CD}\uFE0F', name: 'Bike' },
  { key: 'van',  label: '\u{1F690} Van (5+ Seats)',   emoji: '\u{1F690}', name: 'Van' },
];

export default class PassengerSelectVehicle extends Action {

  constructor(options) {
    super(Object.assign({ type: 'passenger-select-vehicle' }, options));
  }

  get() {
    const rows = VEHICLES
      .filter(v => !isCategoryBlocked(v.key))
      .map(v => [{ label: v.label, value: v.key }]);

    if (rows.length === 0) {
      return new CompositeResponse()
        .add(new TextResponse({ message: '\u274C No vehicle categories are currently available. Please try again later.' }))
        .add(new RedirectResponse({ path: 'select-user-type' }));
    }

    return new CompositeResponse()
      .add(new TextResponse({ message: '\u{1F697} What type of vehicle do you need?' }))
      .add(new OptionsResponse({ rows }));
  }

  post(value) {
    const vehicle = VEHICLES.find(v => v.key === value);
    if (!vehicle || isCategoryBlocked(value)) {
      return this.get();
    }
    return new CompositeResponse()
      .add(new UserStateResponse({ requestedVehicleType: value }))
      .add(new TextResponse({ message: `\u2705 ${vehicle.emoji} ${vehicle.name} selected!` }))
      .add(new RedirectResponse({ path: 'passenger-request-location' }));
  }
}
