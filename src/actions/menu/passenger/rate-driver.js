import Action from '../../../action';
import CompositeResponse from '../../../responses/composite-response';
import TextResponse from '../../../responses/text-response';
import RedirectResponse from '../../../responses/redirect-response';
import UserStateResponse from '../../../responses/user-state-response';
import OptionsResponse from '../../../responses/options-response';
import firebaseDB from '../../../firebase-db';

export default class PassengerRateDriver extends Action {
  constructor(options) {
    super(Object.assign({ type: 'passenger-rate-driver' }, options));
  }

  get() {
    return new CompositeResponse()
      .add(new TextResponse({ message: 'Please rate your driver:' }))
      .add(new OptionsResponse({
        rows: [
          [
            { label: '\u2B50\uFE0F1', value: '1' },
            { label: '\u2B50\uFE0F2', value: '2' },
            { label: '\u2B50\uFE0F3', value: '3' },
            { label: '\u2B50\uFE0F4', value: '4' },
            { label: '\u2B50\uFE0F5', value: '5' },
          ],
        ],
      }));
  }

  post(value) {
    const rating = parseInt(value, 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return new CompositeResponse()
        .add(new TextResponse({ message: 'Please select a rating from 1 to 5.' }))
        .add(new OptionsResponse({
          rows: [
            [
              { label: '\u2B50\uFE0F1', value: '1' },
              { label: '\u2B50\uFE0F2', value: '2' },
              { label: '\u2B50\uFE0F3', value: '3' },
              { label: '\u2B50\uFE0F4', value: '4' },
              { label: '\u2B50\uFE0F5', value: '5' },
            ],
          ],
        }));
    }

    const driverKey = this.user.state.driverKey;
    if (driverKey) {
      try {
        const db = firebaseDB.config();
        const ratingRef = db.ref(`users/${driverKey}/ratings`).push();
        ratingRef.set({
          rating,
          ratedBy: this.user.userKey,
          timestamp: Date.now(),
        });
      } catch (e) {
      }
    }

    return new CompositeResponse()
      .add(new UserStateResponse({
        tripStatus: null,
        driverPhone: null,
        driverKey: null,
      }))
      .add(new TextResponse({ message: `Thank you for your ${rating} \u2B50\uFE0F rating!` }))
      .add(new RedirectResponse({ path: 'select-user-type' }));
  }
}
