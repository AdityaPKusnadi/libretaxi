import Action from '../../action';
import RequestLocationResponse from '../../responses/request-location-response';
import CompositeResponse from '../../responses/composite-response';
import UpdateLocationResponse from '../../responses/update-location-response';
import UserStateResponse from '../../responses/user-state-response';
import TextResponse from '../../responses/text-response';
import RedirectResponse from '../../responses/redirect-response';
import If from '../../responses/if-response';
import Location from '../../conditions/location';
import ErrorResponse from '../../responses/error-response';
import CheckinResponse from '../../responses/checkin-response';

export default class UpdateMyLocation extends Action {

  constructor(options) {
    super(Object.assign({ type: 'update-my-location' }, options));
  }

  get() {
    return new CompositeResponse()
      .add(new TextResponse({ message: '📍 Please share your current location to update your position.' }))
      .add(new RequestLocationResponse({ buttonText: '📍 Send location' }));
  }

  post(value) {
    const isDriver = this.user.state.userType === 'driver' && this.user.state.radius != null;
    
    let okResponse = new CompositeResponse()
      .add(new UpdateLocationResponse({ location: value }))
      .add(new UserStateResponse({ location: value }))
      .add(new TextResponse({ message: '👌 Location successfully updated!' }))
      .add(new RedirectResponse({ path: 'select-user-type' }));
      
    if (isDriver) {
      okResponse = new CompositeResponse()
        .add(new UpdateLocationResponse({ location: value }))
        .add(new UserStateResponse({ location: value }))
        .add(new CheckinResponse({ driverKey: this.user.userKey }))
        .add(new TextResponse({ message: '👌 Location successfully updated!' }))
        .add(new RedirectResponse({ path: 'select-user-type' }));
    }

    return new If({
      condition: new Location(value),
      ok: okResponse,
      err: new ErrorResponse({ message: this.gt('error_location') }),
    });
  }
}
