const fetch = require('node-fetch');
const { Telegraf } = require('telegraf');

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo'; // Tu token Telegram
const CHAT_ID = 1282174548; // Tu chat ID

const AERODATABOX_CLIENT_ID = 'b88008800@gmail.com-api-client';
const AERODATABOX_CLIENT_SECRET = 'C8RLV81IuttFvdAK5vJHpBWlCnWnqfBZ';

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Función para obtener vuelos a BHX en las próximas 3 horas
async function getFlightsToBHX() {
  const now = new Date();
  const offsetMinutes = 0; // Ajusta según zona horaria si quieres
  const durationMinutes = 180; // 3 horas

  const url = `https://aerodatabox.p.rapidapi.com/flights/airports/iata/BHX?offsetMinutes=${offsetMinutes}&durationMinutes=${durationMinutes}&withLeg=true&direction=Arrival`;

  const headers = {
    'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
    'x-rapidapi-key': AERODATABOX_CLIENT_SECRET, // Usar API key aquí, el clientSecret parece el API key en tu caso
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Error API: ${res.status}`);

    const data = await res.json();

    // Filtrar vuelos desviados
    const divertedFlights = data.filter(f => f.status.toLowerCase().includes('diverted'));

    return divertedFlights;
  } catch (err) {
    console.error('Error fetching flights:', err);
    return null;
  }
}

// Función para enviar mensaje si hay vuelos desviados
async function checkAndNotify() {
  const diverted = await getFlightsToBHX();
  if (!diverted) {
    await bot.telegram.sendMessage(CHAT_ID, 'Error fetching flights data.');
    return;
  }

  if (diverted.length === 0) {
    console.log('No diverted flights detected.');
    return;
  }

  let msg = '*Alert: Diverted flights to Birmingham Airport detected:*\n';
  diverted.forEach(f => {
    msg += `• Flight ${f.flightNumber} from ${f.departure?.iata} scheduled at ${f.scheduledTimeLocal}\n`;
  });

  await bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
  console.log('Notification sent.');
}

// Comando /start para verificar bot activo
bot.start((ctx) => ctx.reply('Bot BHXAlerts activo. Usa /check para revisar vuelos desviados.'));

// Comando /check para forzar chequeo manual
bot.command('check', async (ctx) => {
  ctx.reply('Checking for diverted flights, please wait...');
  await checkAndNotify();
});

// Chequeo automático cada 15 minutos
setInterval(checkAndNotify, 15 * 60 * 1000);

bot.launch();

console.log('Bot BHXAlerts running...');
