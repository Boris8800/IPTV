import express from 'express';
import { Telegraf } from 'telegraf';
import puppeteer from 'puppeteer-core';

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548'; // tu chat id

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Lanzar Chrome en Render (ajusta ruta si hace falta)
async function launchBrowser() {
  return await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

async function scrapeArrivals() {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto('https://www.flightstats.com/v2/flight-tracker/arrivals/BHX', {
    waitUntil: 'networkidle2',
  });

  await page.waitForSelector('div.flight'); // ajusta si cambia el selector

  const flights = await page.evaluate(() => {
    const flightElements = Array.from(document.querySelectorAll('div.flight'));
    const now = Date.now();
    const sixHoursMs = 6 * 60 * 60 * 1000;

    return flightElements.map(el => {
      const flightNumber = el.querySelector('.flight-number')?.innerText.trim() || '';
      const scheduledTimeText = el.querySelector('.scheduled-time')?.innerText.trim() || '';
      const status = el.querySelector('.status')?.innerText.trim() || '';
      const diverted = status.toLowerCase().includes('diverted');

      const [hours, minutes] = scheduledTimeText.split(':').map(Number);
      const flightDate = new Date();
      flightDate.setHours(hours, minutes, 0, 0);
      const timeDiff = flightDate.getTime() - now;

      return { flightNumber, scheduledTimeText, status, diverted, timeDiff };
    }).filter(f => f.timeDiff >= 0 && f.timeDiff <= sixHoursMs);
  });

  await browser.close();
  return flights;
}

async function checkFlightsAndNotify() {
  try {
    const flights = await scrapeArrivals();

    if (flights.length === 0) {
      await bot.telegram.sendMessage(CHAT_ID, 'No arrivals in the next 6 hours at BHX.');
      return;
    }

    const divertedFlights = flights.filter(f => f.diverted);

    let message = `Arrivals at Birmingham (BHX) in the next 6 hours:\n`;
    flights.forEach(f => {
      message += `• ${f.flightNumber} at ${f.scheduledTimeText} - Status: ${f.status}\n`;
    });

    if (divertedFlights.length > 0) {
      message += `\n⚠️ Diverted flights:\n`;
      divertedFlights.forEach(f => {
        message += `• ${f.flightNumber} scheduled at ${f.scheduledTimeText}\n`;
      });
    } else {
      message += `\nNo diverted flights detected.`;
    }

    await bot.telegram.sendMessage(CHAT_ID, message);

  } catch (err) {
    console.error('Error checking flights:', err);
    await bot.telegram.sendMessage(CHAT_ID, 'Error fetching flight data. Please try again later.');
  }
}

// Comando /flights manual
bot.command('flights', async (ctx) => {
  await ctx.reply('Checking arrivals at BHX for next 6 hours...');
  await checkFlightsAndNotify();
});

bot.launch();
console.log('Bot BHXalerts started');

// Ejecutar revisión cada 10 minutos
setInterval(checkFlightsAndNotify, 10 * 60 * 1000);

// EXPRESS para mantener puerto abierto en Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot BHXalerts running'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
