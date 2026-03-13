import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import InterruptPromptResponse from '../../../responses/interrupt-prompt-response';
import RedirectResponse from '../../../responses/redirect-response';
import UserStateResponse from '../../../responses/user-state-response';

export default class PassengerTripStarted extends Action {
  constructor(options) {
    super(Object.assign({ type: 'passenger-trip-started' }, options));
  }

  get() {
    return new TextResponse({ message: 'Trip started.' });
  }

  call(args) {
    if (args && args.started) {
      if (!this.user.state.tripStatus && !this.user.state.driverKey) {
        return new TextResponse({ message: '' });
      }
      const rideNum = args.rideNum || '##';
      return new CompositeResponse()
        .add(new InterruptPromptResponse())
        .add(new UserStateResponse({
          tripStatus: 'in_progress',
        }))
        .add(new TextResponse({
          message: `\u{1F7E2} Your trip #${rideNum} has started.`,
        }))
        .add(new RedirectResponse({ path: 'blank-screen' }));
    }
    return super.call(args);
  }

  post(value) {
    return new RedirectResponse({ path: 'blank-screen' });
  }
}
