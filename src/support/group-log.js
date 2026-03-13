import Settings from '../../settings';

const settings = new Settings();

export function sendGroupLog(message) {
  if (!settings.LOG_GROUP_ID) return;
  const tgApi = `https://api.telegram.org/bot${settings.TELEGRAM_TOKEN}`;
  fetch(`${tgApi}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: settings.LOG_GROUP_ID,
      text: message,
    }),
  }).catch((e) => {
    console.log(`Error sending group log: ${e}`);
  });
}

export function formatDate() {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `[${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}]`;
}
