const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548';

async function sendTelegramMessage(chat_id, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    throw new Error('Error sending Telegram message');
  }
  console.log(`Telegram message sent to ${chat_id}:`, text);
}

function parseTimeToDate(timeStr) {
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const flightDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  if (flightDate < now) flightDate.setDate(flightDate.getDate() + 1);
  return flightDate;
}

async function getFlightsReport() {
  console.log('Chromium path:', puppeteer.executablePath());

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: puppeteer.executablePath(),
  });

  const page = await browser.newPage();

  await page.goto('https://www.birminghamairport.co.uk/flights/arrivals/', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(5000);

  const flightsData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.flights__row'));
    return rows.map(row => {
      const flightNumber = row.querySelector('.flights__flight-number')?.innerText.trim() || 'N/A';
      const origin = row.querySelector('.flights__origin')?.innerText.trim() || 'N/A';
      const scheduledTime = row.querySelector('.flights__scheduled-time')?.innerText.trim() || 'N/A';
      const status = row.querySelector('.flights__status')?.innerText.trim().toLowerCase() || '';
      return { flightNumber, origin, scheduledTime, status };
    });
  });

  await browser.close();

  const now = new Date();
  const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const divertedFlights = flightsData.filter(f => f.status.includes('diverted'));

  const arrivalStatuses = ['expected', 'scheduled', 'on time', 'due'];
  const upcomingFlights = flightsData.filter(f => {
    if (!arrivalStatuses.some(s => f.status.includes(s))) return false;
    const flightDate = parseTimeToDate(f.scheduledTime);
    return flightDate >= now && flightDate <= threeHoursLater;
  });

  let report = '';

  if (divertedFlights.length > 0) {
    report += '*🚨 Diverted Flights:*\n';
    divertedFlights.forEach(f => {
      report += `• ${f.flightNumber} from ${f.origin} at ${f.scheduledTime}\n`;
    });
  } else {
    report += 'No diverted flights.\n';
  }

  if (upcomingFlights.length > 0) {
    report += '\n*Upcoming arrivals (next 3 hours):*\n';
    upcomingFlights.forEach(f => {
      report += `• ${f.flightNumber} from ${f.origin} at ${f.scheduledTime} — ${f.status}\n`;
    });
  } else {
    report += '\nNo upcoming arrivals in next 3 hours.';
  }

  return report;
}

async function listenForMessages(offset = 0) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=60&offset=${offset}`;
  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.result && data.result.length > 0) {
      for (const update of data.result) {
        const updateId = update.update_id;
        const message = update.message;

        if (message && message.text) {
          const chatId = message.chat.id;
          const text = message.text.toLowerCase();

          if (text === '/flights' || text === '/check' || text === '/status') {
            await sendTelegramMessage(chatId, 'Checking flights, please wait...');
            try {
              const report = await getFlightsReport();
              await sendTelegramMessage(chatId, report);
            } catch (err) {
              console.error('Error fetching flights:', err);
              await sendTelegramMessage(chatId, 'Error fetching flights data.');
            }
          } else {
            await sendTelegramMessage(chatId, 'Send /flights to get the latest flight info.');
          }

          offset = updateId + 1;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching updates:', error);
  }
  setTimeout(() => listenForMessages(offset), 1000);
}

(async () => {
  listenForMessages();
})();
