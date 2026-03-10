import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import InterruptPromptResponse from '../../../responses/interrupt-prompt-response';
import RedirectResponse from '../../../responses/redirect-response';
import UserStateResponse from '../../../responses/user-state-response';
import OptionsResponse from '../../../responses/options-response';
import CallActionResponse from '../../../responses/call-action-response';

export default class PassengerRideAccepted extends Action {
  constructor(options) {
    super(Object.assign({ type: 'passenger-ride-accepted' }, options));
  }

  get() {
    return new TextResponse({ message: 'Ride accepted.' });
  }

  call(args) {
    if (args && args.rideNumDisplay) {
      return new CompositeResponse()
        .add(new InterruptPromptResponse())
        .add(new UserStateResponse({
          menuLocation: 'passenger-ride-accepted',
          tripStatus: 'accepted',
          driverPhone: args.driverPhone,
          driverKey: args.driverKey,
        }))
        .add(new TextResponse({ 
          message: `✅ Ride #${args.rideNumDisplay} confirmed by driver.\n` +
                   `Driver can proceed to pickup.\n\n` +
                   `🚘 Driver: ${args.driverPhone}\n` +
                   `📏 Distance: ${args.distanceKm} km\n` +
                   `💰 Total Fare: ${args.fareFormat}`
        }))
        .add(new OptionsResponse({
          rows: [
            [{ label: '🟢 Proceed', value: 'proceed' }],
          ],
        }));
    }
    return super.call(args);
  }

  post(value) {
    const driverKey = this.user.state.driverKey;

    const response = new CompositeResponse()
      .add(new TextResponse({ message: '👌 OK!' }));

    if (driverKey) {
      response.add(new CallActionResponse({
        userKey: driverKey,
        route: 'driver-accept-ride',
        arg: { showLocations: true },
      }));
    }

    response.add(new RedirectResponse({ path: 'blank-screen' }));
    return response;
  }
}
