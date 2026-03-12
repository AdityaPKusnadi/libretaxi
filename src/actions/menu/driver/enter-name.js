import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import UserStateResponse from '../../../responses/user-state-response';
import RedirectResponse from '../../../responses/redirect-response';
import RequestUserInputResponse from '../../../responses/request-user-input-response';

export default class DriverEnterName extends Action {
  constructor(options) {
    super(Object.assign({ type: 'driver-enter-name' }, options));
  }

  get() {
    return new CompositeResponse()
      .add(new TextResponse({ message: '👤 Please enter your full name:' }))
      .add(new RequestUserInputResponse());
  }

  post(value) {
    if (!value || typeof value !== 'string' || value.trim().length < 2) {
      return new CompositeResponse()
        .add(new TextResponse({ message: '❌ Please enter a valid name (at least 2 characters).' }))
        .add(new RequestUserInputResponse());
    }

    const name = value.trim();
    const parts = name.split(/\s+/);
    const first = parts[0] || name;
    const last = parts.slice(1).join(' ') || '';

    return new CompositeResponse()
      .add(new TextResponse({ message: `👌 Name set: ${name}` }))
      .add(new UserStateResponse({
        identity: Object.assign({}, this.user.state.identity || {}, {
          first,
          last,
          fullName: name,
        }),
        driverName: name,
      }))
      .add(new RedirectResponse({ path: 'driver-enter-plate' }));
  }
}
