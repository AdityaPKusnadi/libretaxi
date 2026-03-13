import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import InterruptPromptResponse from '../../../responses/interrupt-prompt-response';
import RedirectResponse from '../../../responses/redirect-response';
import UserStateResponse from '../../../responses/user-state-response';
import CancelCurrentOrderResponse from '../../../responses/cancel-current-order-response';
import { logTripToOracle } from '../../../support/oracle-logger';

export default class PassengerRideAccepted extends Action {
  constructor(options) {
    super(Object.assign({ type: 'passenger-ride-accepted' }, options));
  }

  get() {
    return new TextResponse({ message: 'Ride accepted.' });
  }

  call(args) {
    if (args && args.rideNumDisplay) {
      const driverName = args.driverName || 'Driver';
      const driverUsername = args.driverUsername || args.driverPhone || 'N/A';

      const msg = `\u2705 Ride #${args.rideNumDisplay} accepted!\n\n` +
        `Driver: ${driverName}\n` +
        `Contact: ${driverUsername}\n\n` +
        `Please coordinate pickup in chat.`;

      return new CompositeResponse()
        .add(new InterruptPromptResponse())
        .add(new UserStateResponse({
          menuLocation: 'passenger-ride-accepted',
          tripStatus: 'accepted',
          driverPhone: args.driverPhone,
          driverKey: args.driverKey,
          driverName: driverName,
          driverUsername: driverUsername,
          driverVehicle: args.driverVehicle || 'Car',
          driverPlate: args.driverPlate || 'N/A',
        }))
        .add(new TextResponse({ message: msg }))
        .add(new RedirectResponse({ path: 'blank-screen' }));
    }
    return super.call(args);
  }

  post(value) {
    return new RedirectResponse({ path: 'blank-screen' });
  }
}
