import puppeteer from 'puppeteer';
import { Telegraf } from 'telegraf';

const TELEGRAM_BOT_TOKEN = 'TU_TOKEN';
const CHAT_ID = 'TU_CHAT_ID';

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

  // Esperar tabla de vuelos
  await page.waitForSelector('table'); // Ajustar selector si necesario

  // Extraer vuelos en próximas 6 horas, buscar desviados
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
      // Aquí deberías parsear la hora y filtrar por vuelos en próximas 6 horas
      // y también vuelos desviados (status que contenga "Diverted")
      // Este filtro es básico:
      return flight.status && (flight.status.toLowerCase().includes('diverted'));
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
console.log('Bot started');

// Ejecutar cada 10 minutos
setInterval(checkAndNotify, 10 * 60 * 1000);

// También podrías añadir comando Telegram para pedir resumen manual
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
