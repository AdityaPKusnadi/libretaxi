import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import RequestUserInputResponse from '../../../responses/request-user-input-response';

export default class DriverEnterPlate extends Action {
  constructor(options) {
    super(Object.assign({ type: 'driver-enter-plate' }, options));
  }

  get() {
    return new CompositeResponse()
      .add(new TextResponse({ message: '🔢 Please enter your vehicle plate number:' }))
      .add(new RequestUserInputResponse());
  }

  post(value) {
    if (!value || typeof value !== 'string' || value.trim().length < 2) {
      return new CompositeResponse()
        .add(new TextResponse({ message: '❌ Please enter a valid plate number.' }))
        .add(new RequestUserInputResponse());
    }

    const plate = value.trim().toUpperCase();

    return new CompositeResponse()
      .add(new TextResponse({ message: `👌 Plate number set: ${plate}` }))
      .add(new UserStateResponse({ vehiclePlate: plate }))
      .add(new RedirectResponse({ path: 'driver-explain-checkins' }));
  }
}
