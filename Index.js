const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error('Error sending Telegram message');
  }
  console.log('Telegram message sent:', text);
}

async function checkDivertedFlights() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.goto('https://www.birminghamairport.co.uk/flights/arrivals/', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(5000);

  const divertedFlights = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.flights__row'));
    return rows.filter(row => {
      const status = row.querySelector('.flights__status')?.innerText.toLowerCase() || '';
      return status.includes('diverted');
    }).map(row => {
      const flightNumber = row.querySelector('.flights__flight-number')?.innerText.trim() || 'N/A';
      const origin = row.querySelector('.flights__origin')?.innerText.trim() || 'N/A';
      const scheduledTime = row.querySelector('.flights__scheduled-time')?.innerText.trim() || 'N/A';
      return { flightNumber, origin, scheduledTime };
    });
  });

  await browser.close();

  if (divertedFlights.length === 0) {
    console.log('No diverted flights found.');
    return;
  }

  for (const flight of divertedFlights) {
    const message = `🚨 Flight diverted: ${flight.flightNumber} from ${flight.origin} scheduled at ${flight.scheduledTime}`;
    await sendTelegramMessage(message);
  }
}

checkDivertedFlights();
setInterval(checkDivertedFlights, 10 * 60 * 1000);
