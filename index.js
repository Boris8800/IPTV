const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548'; // Tu chat ID para mensajes directos

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

async function getFlights() {
  try {
    // Aquí puedes poner la llamada a una API real o simular datos
    // Ejemplo simple simulando vuelos desviados a BHX:
    // (Lo ideal es que conectes a una API real que tengas acceso)
    const divertedFlights = [
      { flightNumber: 'AB123', origin: 'Madrid', scheduledTime: '15:30' },
      { flightNumber: 'CD456', origin: 'Paris', scheduledTime: '16:10' }
    ];

    if (divertedFlights.length === 0) return 'No hay vuelos desviados a Birmingham en este momento.';

    let message = '*Vuelos desviados a Birmingham (BHX):*\n';
    divertedFlights.forEach(flight => {
      message += `• ${flight.flightNumber} desde ${flight.origin} a las ${flight.scheduledTime}\n`;
    });
    return message;

  } catch (error) {
    console.error('Error fetching flights:', error);
    return 'Error obteniendo datos de vuelos.';
  }
}

bot.start((ctx) => ctx.reply('Bienvenido a BHXalerts Bot! Escribe /flights para ver vuelos desviados a Birmingham.'));

bot.command('flights', async (ctx) => {
  await ctx.reply('Consultando vuelos desviados a Birmingham, por favor espera...');
  const flightsMessage = await getFlights();
  ctx.reply(flightsMessage, { parse_mode: 'Markdown' });
});

// Opcional: responde si el bot está activo
bot.command('status', (ctx) => {
  ctx.reply('BHXalerts está activo y funcionando.');
});

bot.launch().then(() => {
  console.log('BHXalerts Bot iniciado');
});

// Para cerrar el bot con Ctrl+C o señal de terminación
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
