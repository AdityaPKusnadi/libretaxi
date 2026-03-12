import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import InterruptPromptResponse from '../../../responses/interrupt-prompt-response';
import RedirectResponse from '../../../responses/redirect-response';
import UserStateResponse from '../../../responses/user-state-response';
import OptionsResponse from '../../../responses/options-response';
import CallActionResponse from '../../../responses/call-action-response';
import CancelCurrentOrderResponse from '../../../responses/cancel-current-order-response';

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
          rideDistanceKm: args.distanceKm,
          rideFareFormat: args.fareFormat,
        }))
        .add(new TextResponse({ 
          message: `🚕 A driver has accepted your ride!\n\n` +
                   `📏 Estimated Distance: ${args.distanceKm} km\n` +
                   `💰 Estimated Fare: ${args.fareFormat}\n\n` +
                   `Would you like to confirm this booking?`
        }))
        .add(new OptionsResponse({
          rows: [
            [{ label: '🟢 Confirm Booking', value: 'confirm' }],
            [{ label: '🔴 Cancel Booking', value: 'cancel' }],
          ],
        }));
    }
    return super.call(args);
  }

  post(value) {
    const driverKey = this.user.state.driverKey;

    if (value === 'confirm' || (value && value.includes('Confirm'))) {
      const response = new CompositeResponse()
        .add(new TextResponse({ message: '✅ Booking confirmed!' }));

      if (driverKey) {
        response.add(new CallActionResponse({
          userKey: driverKey,
          route: 'driver-accept-ride',
          arg: { showLocations: true },
        }));
      }

      response.add(new TextResponse({
        message: `🚘 Driver Contact: ${this.user.state.driverPhone || 'N/A'}\n\n` +
                 `Your driver is on the way to your pickup location. Please wait!`
      }));

      response.add(new RedirectResponse({ path: 'blank-screen' }));
      return response;
    }

    if (value === 'cancel' || (value && value.includes('Cancel'))) {
      const response = new CompositeResponse()
        .add(new TextResponse({ message: '❌ Booking cancelled.' }));

      if (driverKey) {
        response.add(new CallActionResponse({
          userKey: driverKey,
          route: 'show-message',
          arg: {
            expectedState: {},
            message: '❌ Rider has cancelled the booking. You are now available for new rides.',
            path: 'driver-index',
          },
        }));
      }

      response
        .add(new UserStateResponse({
          tripStatus: null,
          driverPhone: null,
          driverKey: null,
        }))
        .add(new CancelCurrentOrderResponse())
        .add(new RedirectResponse({ path: 'select-user-type' }));
      return response;
    }

    return new CompositeResponse()
      .add(new TextResponse({ message: 'Please choose Confirm Booking or Cancel Booking.' }))
      .add(new OptionsResponse({
        rows: [
          [{ label: '🟢 Confirm Booking', value: 'confirm' }],
          [{ label: '🔴 Cancel Booking', value: 'cancel' }],
        ],
      }));
  }
}
