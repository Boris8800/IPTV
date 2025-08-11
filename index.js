import { Telegraf } from "telegraf";
import puppeteer from "puppeteer";

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548';

const BHX_ARRIVALS_URL = "https://www.flightstats.com/v2/flight-tracker/arrivals/BHX";

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

function parseTimeToDate(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  let date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  if (date < now) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

async function scrapeArrivals() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(BHX_ARRIVALS_URL, { waitUntil: "networkidle2" });

  const flights = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".ticket-flight .ticket")];
    return rows.map(row => {
      const flightNumber = row.querySelector(".ticket-flight-number")?.textContent.trim() || "";
      const origin = row.querySelector(".ticket-airport")?.textContent.trim() || "";
      const scheduledTime = row.querySelector(".ticket-time")?.textContent.trim() || "";
      const status = row.querySelector(".ticket-status")?.textContent.trim() || "";
      return { flightNumber, origin, scheduledTime, status };
    });
  });

  await browser.close();
  return flights;
}

function filterNext6HoursFlights(flights) {
  const now = new Date();
  const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return flights.filter(flight => {
    const arrivalDate = parseTimeToDate(flight.scheduledTime);
    return arrivalDate >= now && arrivalDate <= sixHoursLater;
  });
}

function filterDivertedFlights(flights) {
  return flights.filter(flight => flight.status.toLowerCase().includes("diverted"));
}

async function sendFlightsSummary(ctx) {
  try {
    const flights = await scrapeArrivals();
    const upcomingFlights = filterNext6HoursFlights(flights);

    let message = `🛬 *Upcoming arrivals at Birmingham (next 6 hours):*\n`;
    if (upcomingFlights.length === 0) {
      message += "No arrivals in the next 6 hours.";
    } else {
      upcomingFlights.forEach(flight => {
        message += `• ${flight.flightNumber} from ${flight.origin} at ${flight.scheduledTime} — Status: ${flight.status}\n`;
      });
    }

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    await ctx.reply("Error fetching flight data. Please try again later.");
    console.error(error);
  }
}

async function checkDivertedFlightsAndAlert() {
  try {
    const flights = await scrapeArrivals();
    const divertedFlights = filterDivertedFlights(flights);
    if (divertedFlights.length === 0) return; // No alert if no diverted flights

    let alertMsg = `🛑 *Diverted flights to Birmingham:*\n`;
    divertedFlights.forEach(flight => {
      alertMsg += `• ${flight.flightNumber} from ${flight.origin} — Status: ${flight.status}\n`;
    });

    await bot.telegram.sendMessage(CHAT_ID, alertMsg, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error checking diverted flights:", error);
  }
}

bot.start(ctx => ctx.reply("Welcome! Use /flights to get arrivals at Birmingham Airport in the next 6 hours."));
bot.command("flights", sendFlightsSummary);

setInterval(checkDivertedFlightsAndAlert, 10 * 60 * 1000); // check cada 10 minutos

bot.launch();
console.log("Bot BHXalerts started");
