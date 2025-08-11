const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';

// OpenSky API credenciales (clientId y clientSecret)
const OPENSKY_USERNAME = 'b88008800@gmail.com-api-client';
const OPENSKY_PASSWORD = 'C8RLV81IuttFvdAK5vJHpBWlCnWnqfBZ';

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

async function getFlightsToBHX() {
  try {
    // Endpoint OpenSky: vuelos en aire con destino BHX
    // Nota: OpenSky usa ICAO para aeropuertos, BHX ICAO = EGBB
    const url = 'https://opensky-network.org/api/flights/destination?airport=EGBB&begin=' + Math.floor(Date.now()/1000 - 3*3600) + '&end=' + Math.floor(Date.now()/1000);

    const res = await fetch(url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(OPENSKY_USERNAME + ':' + OPENSKY_PASSWORD).toString('base64')
      }
    });

    if (!res.ok) {
      throw new Error(`OpenSky API error: ${res.status}`);
    }

    const flights = await res.json();

    if (!flights.length) return 'No hay vuelos con destino a Birmingham en las últimas 3 horas.';

    // Buscamos vuelos desviados: si destination no es EGBB (BHX)
    const divertedFlights = flights.filter(flight => flight.estArrivalAirport !== 'EGBB');

    let message = '';

    if (divertedFlights.length > 0) {
      message += '*Vuelos desviados a Birmingham (BHX):*\n';
      divertedFlights.forEach(f => {
        message += `• Vuelo ${f.callsign || 'N/A'} de ${f.estDepartureAirport || 'N/A'} (programado llegada: ${new Date(f.lastSeen * 1000).toLocaleTimeString()})\n`;
      });
    } else {
      message += 'No hay vuelos desviados a Birmingham en las últimas 3 horas.\n';
    }

    // También mostramos vuelos próximos a aterrizar (en tiempo real)
    const upcomingFlights = flights.filter(f => f.estArrivalAirport === 'EGBB');
    if (upcomingFlights.length > 0) {
      message += '\n*Vuelos con destino a Birmingham en las últimas 3 horas:*\n';
      upcomingFlights.forEach(f => {
        message += `• Vuelo ${f.callsign || 'N/A'} de ${f.estDepartureAirport || 'N/A'} (estimado llegada: ${new Date(f.lastSeen * 1000).toLocaleTimeString()})\n`;
      });
    }

    return message;

  } catch (error) {
    console.error('Error fetching OpenSky flights:', error);
    return 'Error obteniendo datos de vuelos desde OpenSky.';
  }
}

bot.start((ctx) => ctx.reply('Bienvenido a BHXalerts Bot! Escribe /flights para ver vuelos desviados a Birmingham.'));

bot.command('flights', async (ctx) => {
  await ctx.reply('Consultando vuelos a Birmingham, por favor espera...');
  const report = await getFlightsToBHX();
  ctx.reply(report, { parse_mode: 'Markdown' });
});

bot.command('status', (ctx) => {
  ctx.reply('BHXalerts está activo y funcionando.');
});

bot.launch().then(() => {
  console.log('BHXalerts Bot iniciado con OpenSky API');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
