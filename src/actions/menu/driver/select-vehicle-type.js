import Action from '../../../action';
import OptionsResponse from '../../../responses/options-response';
import CompositeResponse from '../../../responses/composite-response';
import UserStateResponse from '../../../responses/user-state-response';
import TextResponse from '../../../responses/text-response';
import RedirectResponse from '../../../responses/redirect-response';
import ErrorResponse from '../../../responses/error-response';

const VALID_TYPES = ['car', 'tuk', 'bike', 'van'];

const VEHICLE_LABELS = {
  car: '\u{1F697} Car',
  tuk: '\u{1F6FA} Tuk',
  bike: '\u{1F3CD}\uFE0F Bike',
  van: '\u{1F690} Van',
};

export default class SelectVehicleType extends Action {

  constructor(options) {
    super(Object.assign({ type: 'driver-select-vehicle-type' }, options));
  }

  get() {
    return new CompositeResponse()
      .add(new TextResponse({ message: 'Select Your Vehicle Type' }))
      .add(new OptionsResponse({
        rows: VALID_TYPES.map(v => [{ label: VEHICLE_LABELS[v], value: v }]),
      }));
  }

  post(value) {
    if (!VALID_TYPES.includes(value)) {
      return new CompositeResponse()
        .add(new ErrorResponse({ message: 'Please select a valid vehicle type.' }))
        .add(this.get());
    }

    return new CompositeResponse()
      .add(new TextResponse({ message: `\u{1F44C} ${VEHICLE_LABELS[value]} selected!` }))
      .add(new UserStateResponse({ vehicleType: value }))
      .add(new RedirectResponse({ path: 'driver-enter-name' }));
  }
}
