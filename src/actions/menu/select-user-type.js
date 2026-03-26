import Action from '../../action';
import OptionsResponse from '../../responses/options-response';
import CompositeResponse from '../../responses/composite-response';
import UserStateResponse from '../../responses/user-state-response';
import TextResponse from '../../responses/text-response';
import RedirectResponse from '../../responses/redirect-response';
import If from '../../responses/if-response';
import Equals from '../../conditions/equals';
import NotIn from '../../conditions/not-in';
import ErrorResponse from '../../responses/error-response';
import CancelCurrentOrderResponse from '../../responses/cancel-current-order-response';
import loadFareConfig from '../../fare/fare-config';

export default class SelectUserType extends Action {

  constructor(options) {
    super(Object.assign({ type: 'select-user-type' }, options));
  }

  get() {
    const config = loadFareConfig();
    const botName = config.botName || 'Connect';
    const welcomeMsg = config.welcomeMsg
      || `Welcome to ${botName} \u{1F695}\n\nFast and simple taxi service.`;
    return new CompositeResponse()
      .add(new TextResponse({ message: welcomeMsg }))
      .add(new OptionsResponse({
        rows: [
          [
            { label: '\u{1F695} Request Ride', value: 'passenger' },
            { label: '\u{1F697} I\'m a Driver', value: 'driver' },
          ],
          [
            { label: '\u{1F4CD} Update My Location', value: 'update-location' },
            { label: '\u{1F7E5} Cancel Current Ride', value: 'cancel-ride' },
          ],
          [
            { label: '\u2139\uFE0F Help', value: 'help' },
          ],
        ],
      }));
  }

  post(value) {
    return new CompositeResponse()
      .add(new If({
        condition: new Equals(value, 'passenger'),
        ok: this.user.state.phone
          ? new CompositeResponse()
              .add(new UserStateResponse({ userType: 'passenger' }))
              .add(new RedirectResponse({ path: 'passenger-index' }))
          : new CompositeResponse()
              .add(new UserStateResponse({ userType: 'passenger' }))
              .add(new TextResponse({ message: '\u{1F44C} OK!' }))
              .add(new RedirectResponse({ path: 'request-phone' })),
      }))
      .add(new If({
        condition: new Equals(value, 'driver'),
        ok: (this.user.state.phone && this.user.state.driverName && this.user.state.vehiclePlate)
          ? new CompositeResponse()
              .add(new UserStateResponse({ userType: 'driver' }))
              .add(new TextResponse({ message: '\u{1F44C} Welcome back, driver!' }))
              .add(new RedirectResponse({ path: 'driver-index' }))
          : new CompositeResponse()
              .add(new UserStateResponse({ userType: 'driver' }))
              .add(new TextResponse({ message: '\u{1F44C} OK!' }))
              .add(new RedirectResponse({ path: this.user.state.phone ? 'driver-select-vehicle-type' : 'request-phone' })),
      }))
      .add(new If({
        condition: new Equals(value, 'update-location'),
        ok: new CompositeResponse()
          .add(new RedirectResponse({ path: 'update-my-location' })),
      }))
      .add(new If({
        condition: new Equals(value, 'cancel-ride'),
        ok: this.user.state.currentOrderKey
          ? new CompositeResponse()
              .add(new TextResponse({ message: '\u274C Your current ride has been cancelled.' }))
              .add(new CancelCurrentOrderResponse())
              .add(new UserStateResponse({
                tripStatus: null,
                currentOrderKey: null,
                pendingOrder: null,
                driverKey: null,
                driverPhone: null,
              }))
              .add(new RedirectResponse({ path: 'select-user-type' }))
          : new CompositeResponse()
              .add(new TextResponse({ message: 'You don\'t have an active ride to cancel.' }))
              .add(new RedirectResponse({ path: 'select-user-type' })),
      }))
      .add(new If({
        condition: new Equals(value, 'help'),
        ok: new CompositeResponse()
          .add(new TextResponse({
            message: '\u2139\uFE0F Connect \u2014 Help\n\n' +
              '\u{1F695} Request Ride \u2014 Book a taxi\n' +
              '\u{1F697} I\'m a Driver \u2014 Register or go online as driver\n' +
              '\u{1F4CD} Update My Location \u2014 Update your GPS position\n' +
              '\u{1F7E5} Cancel Current Ride \u2014 Cancel active booking\n\n' +
              'Commands:\n' +
              '/start \u2014 Return to main menu\n' +
              '/cancel \u2014 Cancel current action\n' +
              '/cancelride \u2014 Cancel active ride',
          }))
          .add(new RedirectResponse({ path: 'select-user-type' })),
      }))
      .add(new If({
        condition: new NotIn(value, ['passenger', 'driver', 'update-location', 'cancel-ride', 'help']),
        ok: new ErrorResponse({ message: this.gt('error_try_again') }),
      }));
  }
}
