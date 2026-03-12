import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import OptionsResponse from '../../../responses/options-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';

export default class PassengerSelectVehicle extends Action {

  constructor(options) {
    super(Object.assign({ type: 'passenger-select-vehicle' }, options));
  }

  get() {
    return new CompositeResponse()
      .add(new TextResponse({ message: '\u{1F697} What type of vehicle do you need?' }))
      .add(new OptionsResponse({
        rows: [
          [{ label: '\u{1F697} Car', value: 'car' }],
          [{ label: '\u{1F3CD}\uFE0F Motorbike', value: 'motorbike' }],
        ],
      }));
  }

  post(value) {
    if (value !== 'car' && value !== 'motorbike') {
      return this.get();
    }
    return new CompositeResponse()
      .add(new UserStateResponse({ requestedVehicleType: value }))
      .add(new TextResponse({ message: `\u2705 ${value === 'car' ? '\u{1F697} Car' : '\u{1F3CD}\uFE0F Motorbike'} selected!` }))
      .add(new RedirectResponse({ path: 'passenger-request-location' }));
  }
}
