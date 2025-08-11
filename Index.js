const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548';

async function sendTelegramMessage(chat_id, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'Markdown'
    }),
  });

  if (!res.ok) {
    throw new Error('Error sending Telegram message');
  }
  console.log(`Telegram message sent to ${chat_id}:`, text);
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

          await sendTelegramMessage(chatId, 'Bot is running and connected!');

          offset = updateId + 1;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching updates:', error);
  }
  setTimeout(() => listenForMessages(offset), 1000);
}

function parseTimeToDate(timeStr) {
  // timeStr expected format: "14:30"
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const flightDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  // If time has already passed today, assume it's for tomorrow
  if (flightDate < now) flightDate.setDate(flightDate.getDate() + 1);
  return flightDate;
}

async function checkFlights() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
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

  // Filtrar vuelos desviados
  const divertedFlights = flightsData.filter(f => f.status.includes('diverted'));

  // Filtrar vuelos próximos dentro de 3 horas con status que indica llegada próxima (puede ser "expected", "scheduled", "on time", etc.)
  const arrivalStatuses = ['expected', 'scheduled', 'on time', 'due'];
  const upcomingFlights = flightsData.filter(f => {
    if (!arrivalStatuses.some(s => f.status.includes(s))) return false;
    const flightDate = parseTimeToDate(f.scheduledTime);
    return flightDate >= now && flightDate <= threeHoursLater;
  });

  // Enviar alertas
  if (divertedFlights.length > 0) {
    for (const flight of divertedFlights) {
      const message = `🚨 *Flight diverted*: ${flight.flightNumber} from ${flight.origin} scheduled at ${flight.scheduledTime}`;
      await sendTelegramMessage(CHAT_ID, message);
    }
  } else {
    console.log('No diverted flights found.');
  }

  if (upcomingFlights.length > 0) {
    let message = '*Upcoming arrivals in next 3 hours:*\n';
    for (const flight of upcomingFlights) {
      message += `• ${flight.flightNumber} from ${flight.origin} at ${flight.scheduledTime} — ${flight.status}\n`;
    }
    await sendTelegramMessage(CHAT_ID, message);
  } else {
    console.log('No upcoming arrivals in next 3 hours.');
  }
}

(async () => {
  listenForMessages();
  await checkFlights();
  setInterval(checkFlights, 10 * 60 * 1000);
})();
