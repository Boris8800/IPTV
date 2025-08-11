import { Telegraf } from 'telegraf';
import puppeteer from 'puppeteer';

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548';

const bot = new Telegraf(BOT_TOKEN);

let lastDivertedFlights = [];

async function scrapeFlights() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('https://www.flightstats.com/v2/flight-tracker/arrivals/BHX', {
    waitUntil: 'networkidle2',
  });

  // Scrape flights arrivals next 6h
  // Flight data is inside table rows with class e.g. 'TableRow__StyledTableRow-sc-xyz'
  // This selector depende de la web, puede cambiar: ajusta si no funciona

  const flights = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    const now = new Date();
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    return rows.map(row => {
      const cells = row.querySelectorAll('td');
      const flightNumber = cells[0]?.innerText.trim();
      const origin = cells[1]?.innerText.trim();
      const scheduledTimeText = cells[2]?.innerText.trim();
      const status = cells[4]?.innerText.trim().toLowerCase();

      // Parse scheduledTimeText to Date object for today
      let [hour, minute] = scheduledTimeText.split(':').map(Number);
      let flightTime = new Date(now);
      flightTime.setHours(hour, minute, 0, 0);

      // If flight time is before now, assume it's next day (after midnight)
      if (flightTime < now) flightTime.setDate(flightTime.getDate() + 1);

      return { flightNumber, origin, scheduledTimeText, flightTime, status };
    }).filter(f => f.flightTime <= sixHoursLater);
  });

  await browser.close();
  return flights;
}

function formatFlights(flights) {
  if (flights.length === 0) return 'No flights found in the next 6 hours.';

  return flights.map(f => 
    `• ${f.flightNumber} from ${f.origin} at ${f.scheduledTimeText} (Status: ${f.status})`
  ).join('\n');
}

async function checkDivertedFlights() {
  const flights = await scrapeFlights();
  const diverted = flights.filter(f => f.status.includes('diverted'));

  // Filter new diverted flights compared to last check
  const newDiverted = diverted.filter(f => 
    !lastDivertedFlights.some(ldf => ldf.flightNumber === f.flightNumber)
  );
  lastDivertedFlights = diverted;
  return newDiverted;
}

async function notifyDivertedFlights() {
  const newDiverted = await checkDivertedFlights();
  if (newDiverted.length > 0) {
    const message = `⚠️ Diverted flights to Birmingham detected:\n` + formatFlights(newDiverted);
    await bot.telegram.sendMessage(CHAT_ID, message);
  }
}

bot.start((ctx) => ctx.reply('Welcome to BHXalerts bot! Use /flights for arrivals and /diverted for diverted flights.'));

bot.command('flights', async (ctx) => {
  await ctx.reply('Fetching arrivals to Birmingham for next 6 hours, please wait...');
  try {
    const flights = await scrapeFlights();
    await ctx.reply(formatFlights(flights));
  } catch (e) {
    await ctx.reply('Error fetching flight data. Please try again later.');
  }
});

bot.command('diverted', async (ctx) => {
  await ctx.reply('Checking diverted flights to Birmingham, please wait...');
  try {
    const diverted = await checkDivertedFlights();
    if (diverted.length === 0) {
      await ctx.reply('No diverted flights to Birmingham detected at this time.');
    } else {
      await ctx.reply(formatFlights(diverted));
    }
  } catch (e) {
    await ctx.reply('Error fetching diverted flights data. Please try again later.');
  }
});

bot.launch().then(() => {
  console.log('Bot BHXalerts started');

  // Notify diverted flights every 10 minutes
  setInterval(() => {
    notifyDivertedFlights().catch(console.error);
  }, 10 * 60 * 1000);
});

// Graceful stop on termination signals
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
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
