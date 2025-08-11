const fetch = require('node-fetch');
const { Telegraf } = require('telegraf');

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548'; // tu chat id

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

async function getDivertedFlights() {
  // Ejemplo con OpenSky API para vuelos que llegan a BHX en las próximas 3 horas
  const now = Math.floor(Date.now() / 1000);
  const threeHoursLater = now + 3 * 3600;

  // Cambia URL y filtro según API que uses (esto es solo ejemplo)
  const url = `https://opensky-network.org/api/flights/arrival?airport=BHX&begin=${now}&end=${threeHoursLater}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenSky response status: ${res.status}`);
    const flights = await res.json();

    // Filtrar vuelos desviados (según datos disponibles en la API)
    // Suponiendo que un vuelo desviado tenga algo en la propiedad "diverted" o "status"
    // Aquí no hay campo directo, tendrás que ajustar según tu fuente de datos

    // Por ejemplo, filtrar vuelos con estatus "diverted" o similares:
    const diverted = flights.filter(f => f.diverted === true);

    return diverted;
  } catch (e) {
    console.error('Error fetching diverted flights:', e);
    return null;
  }
}

async function checkAndAlert() {
  const divertedFlights = await getDivertedFlights();

  if (divertedFlights === null) {
    await bot.telegram.sendMessage(CHAT_ID, 'Error fetching flights data.');
    return;
  }

  if (divertedFlights.length === 0) {
    console.log('No diverted flights right now.');
    return; // No avisar si no hay vuelos desviados
  }

  let message = '**Vuelos desviados a Birmingham (BHX):**\n';
  divertedFlights.forEach(f => {
    message += `• ${f.callsign || 'N/A'} desde ${f.origin_airport || 'N/A'} a las ${new Date(f.last_seen * 1000).toLocaleTimeString()}\n`;
  });

  await bot.telegram.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' });
}

bot.start((ctx) => ctx.reply('Bot BHXalerts activo. Escribe /check para consultar vuelos desviados a Birmingham.'));

bot.command('check', async (ctx) => {
  await ctx.reply('Comprobando vuelos desviados, espera...');
  await checkAndAlert();
});

bot.launch();

console.log('Bot BHXalerts started');

// Ejecutar checkAndAlert cada 10 minutos:
setInterval(checkAndAlert, 10 * 60 * 1000);
