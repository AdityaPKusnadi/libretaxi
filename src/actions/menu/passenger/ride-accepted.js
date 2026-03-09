import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import InterruptPromptResponse from '../../../responses/interrupt-prompt-response';
import RedirectResponse from '../../../responses/redirect-response';
import UserStateResponse from '../../../responses/user-state-response';
import OptionsResponse from '../../../responses/options-response';
import If from '../../../responses/if-response';
import Equals from '../../../conditions/equals';
import NotIn from '../../../conditions/not-in';

export default class PassengerRideAccepted extends Action {
  constructor(options) {
    super(Object.assign({ type: 'passenger-ride-accepted' }, options));
  }

  get() {
    // Required but bypassed mostly
    return new TextResponse({ message: 'Ride accepted.' });
  }

  call(args) {
    // Normally Called via CallActionResponse directly with args
    if (args && args.rideNumDisplay) {
      return new CompositeResponse()
        .add(new InterruptPromptResponse())
        .add(new UserStateResponse({
          menuLocation: 'passenger-ride-accepted',
          tripStatus: 'accepted',
          driverPhone: args.driverPhone,
        }))
        .add(new TextResponse({ 
          message: `✅ Ride #${args.rideNumDisplay} confirmed by driver.\n` +
                   `Driver can proceed to pickup.\n\n` +
                   `🚘 Driver: ${args.driverPhone}\n` +
                   `📏 Distance: ${args.distanceKm} km\n` +
                   `💰 Total Fare: ${args.fareFormat}`
        }))
        .add(new RedirectResponse({ path: 'blank-screen' })); // Immediately go to blank screen
    }
    return super.call(args);
  }

  post(value) {
    return new CompositeResponse()
      .add(new TextResponse({ message: '👌 OK!' }))
      .add(new RedirectResponse({ path: 'blank-screen' }));
  }
}
