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
    // Required but bypassed mostly
    return new TextResponse({ message: 'Trip started.' });
  }

  call(args) {
    // Normally Called via CallActionResponse directly with args
    if (args && args.started) {
      return new CompositeResponse()
        .add(new InterruptPromptResponse())
        .add(new UserStateResponse({
          tripStatus: 'in_progress',
        }))
        .add(new TextResponse({ 
          message: `🚕 Trip Started!\n\nThe driver has marked the trip as started and is heading to your destination. Have a safe ride!`
        }))
        .add(new RedirectResponse({ path: 'blank-screen' })); // Keep screen blank
    }
    return super.call(args);
  }

  post(value) {
    return new RedirectResponse({ path: 'blank-screen' });
  }
}
