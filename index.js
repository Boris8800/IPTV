import puppeteer from 'puppeteer';
import { Telegraf } from 'telegraf';

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548';

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

async function scrapeBHXFlights() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });
  const page = await browser.newPage();

  await page.goto('https://www.flightstats.com/v2/flight-tracker/arrivals/BHX', {
    waitUntil: 'networkidle2',
  });

  await page.waitForSelector('table');

  const flights = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const now = new Date();
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    return rows.map(row => {
      const cells = row.querySelectorAll('td');
      return {
        flightNumber: cells[0]?.innerText.trim(),
        origin: cells[1]?.innerText.trim(),
        scheduledArrival: cells[2]?.innerText.trim(),
        status: cells[3]?.innerText.trim(),
      };
    }).filter(flight => {
      // Filtrar vuelos desviados
      return flight.status && flight.status.toLowerCase().includes('diverted');
    });
  });

  await browser.close();
  return flights;
}

async function checkAndNotify() {
  try {
    const flights = await scrapeBHXFlights();
    if (flights.length > 0) {
      const message = `**Diversions to Birmingham Airport (BHX):**\n` +
        flights.map(f => `• ${f.flightNumber} from ${f.origin} at ${f.scheduledArrival} - Status: ${f.status}`).join('\n');

      await bot.telegram.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
    } else {
      console.log('No diversions currently.');
    }
  } catch (e) {
    console.error('Error scraping flights:', e);
  }
}

bot.launch();
console.log('Bot BHXalerts started');

// Ejecutar cada 10 minutos
setInterval(checkAndNotify, 10 * 60 * 1000);

// Comando manual /flights para pedir resumen
bot.command('flights', async (ctx) => {
  const flights = await scrapeBHXFlights();
  if (flights.length > 0) {
    const message = `**Diversions to Birmingham Airport (BHX):**\n` +
      flights.map(f => `• ${f.flightNumber} from ${f.origin} at ${f.scheduledArrival} - Status: ${f.status}`).join('\n');

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('No diversions currently.');
  }
});
