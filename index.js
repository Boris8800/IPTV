import express from 'express';
import { Telegraf } from 'telegraf';
import puppeteer from 'puppeteer';

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548';

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.start((ctx) => ctx.reply('BHXalerts bot started!'));

async function scrapeFlightStats() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Para que funcione en Render
  });
  const page = await browser.newPage();

  await page.goto('https://www.flightstats.com/v2/flight-tracker/arrivals/BHX', { waitUntil: 'networkidle2' });

  // Esperamos que cargue la tabla de arrivals (selector puede cambiar)
  await page.waitForSelector('.ticket');

  // Extraemos la info de vuelos
  const flights = await page.evaluate(() => {
    const results = [];
    const ticketElements = document.querySelectorAll('.ticket');

    const now = new Date();
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    for (let ticket of ticketElements) {
      try {
        const flightNumber = ticket.querySelector('.ticket-header .flight-number')?.textContent.trim() || '';
        const origin = ticket.querySelector('.ticket-header .airport-name')?.textContent.trim() || '';
        const estTimeStr = ticket.querySelector('.ticket-time .estimated-time')?.textContent.trim() || '';

        // Convertir estTimeStr (ejemplo "3:30 PM") a objeto Date para comparar
        // FlightStats puede no dar fecha, solo hora, así que asumiremos hoy

        const estDate = new Date();
        const [time, meridian] = estTimeStr.split(' ');
        if (!time) continue;

        let [hours, minutes] = time.split(':').map(Number);
        if (meridian === 'PM' && hours < 12) hours += 12;
        if (meridian === 'AM' && hours === 12) hours = 0;

        estDate.setHours(hours, minutes || 0, 0, 0);

        // Ajuste si la hora ya pasó (puede ser vuelo temprano mañana)
        if (estDate < now) estDate.setDate(estDate.getDate() + 1);

        if (estDate >= now && estDate <= sixHoursLater) {
          results.push({ flightNumber, origin, estTimeStr });
        }
      } catch (e) {
        // ignorar errores y seguir
      }
    }

    return results;
  });

  await browser.close();
  return flights;
}

async function checkAndSendAlert() {
  try {
    const flights = await scrapeFlightStats();
    if (!flights.length) {
      console.log('No flights in next 6 hours found.');
      return;
    }

    let message = '**Arrivals to Birmingham (BHX) in next 6 hours:**\n';
    for (const f of flights) {
      message += `• ${f.flightNumber} from ${f.origin} at ${f.estTimeStr}\n`;
    }

    await bot.telegram.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
    console.log('Alert sent');
  } catch (err) {
    console.error('Error checking flights:', err);
  }
}

bot.launch();

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('BHXalerts running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Ejecutar la primera comprobación y luego cada 10 minutos
checkAndSendAlert();
setInterval(checkAndSendAlert, 10 * 60 * 1000);
