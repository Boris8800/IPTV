const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = '8369195868:AAGxoIVt8pCMO4qdRIor6fDEmlBlGqkgwzo';
const CHAT_ID = '1282174548';

let lastNotifiedFlights = new Set();

async function sendTelegramMessage(chat_id, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
}

async function fetchFlightsToBHX() {
  const now = Math.floor(Date.now() / 1000);
  const threeHoursAgo = now - 3 * 60 * 60;

  const response = await fetch(`https://opensky-network.org/api/flights/arrival?airport=EGBB&begin=${threeHoursAgo}&end=${now}`);
  if (!response.ok) throw new Error('Error fetching flights from OpenSky API');
  const flights = await response.json();

  return flights.filter(f => f.estArrivalAirport === 'EGBB');
}

function formatFlight(flight) {
  const flightNumber = flight.callsign ? flight.callsign.trim() : 'N/A';
  const origin = flight.estDepartureAirport || 'N/A';
  const arrivalTime = new Date(flight.lastSeen * 1000).toLocaleTimeString();
  const id = flightNumber + '_' + flight.lastSeen;
  return { id, text: `• Vuelo ${flightNumber} desde ${origin}, llegada estimada a las ${arrivalTime}` };
}

async function checkAndNotify() {
  try {
    const flights = await fetchFlightsToBHX();

    // Filtra vuelos nuevos no notificados
    const newFlights = flights
      .map(formatFlight)
      .filter(f => !lastNotifiedFlights.has(f.id));

    if (newFlights.length > 0) {
      let message = '*Nuevos vuelos con destino a Birmingham (BHX):*\n\n';
      newFlights.forEach(f => {
        message += f.text + '\n';
        lastNotifiedFlights.add(f.id);
      });
      await sendTelegramMessage(CHAT_ID, message);
    }
  } catch (error) {
    console.error('Error checking flights:', error);
  }
}

// Escuchar comandos normales
async function listenForMessages(offset = 0) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=60&offset=${offset}`;
  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.result && data.result.length > 0) {
      for (const update of data.result) {
        const updateId = update.update_id;
        const message = update.message;

        if (message && message.text) {
          const chatId = message.chat.id;
          const text = message.text.toLowerCase();

          if (text === '/flights' || text === '/check' || text === '/status') {
            await sendTelegramMessage(chatId, 'Consultando vuelos a Birmingham, por favor espera...');
            try {
              const flights = await fetchFlightsToBHX();
              if (flights.length === 0) {
                await sendTelegramMessage(chatId, 'No hay vuelos recientes a Birmingham en las últimas 3 horas.');
              } else {
                let msg = '*Vuelos con destino a Birmingham (BHX) en las últimas 3 horas:*\n\n';
                flights.forEach(f => {
                  const fdata = formatFlight(f);
                  msg += fdata.text + '\n';
                  lastNotifiedFlights.add(fdata.id);
                });
                await sendTelegramMessage(chatId, msg);
              }
            } catch (err) {
              console.error('Error fetching flights:', err);
              await sendTelegramMessage(chatId, 'Error al obtener los datos de vuelos.');
            }
          } else {
            await sendTelegramMessage(chatId, 'Envía /flights para obtener la información de vuelos a Birmingham.');
          }

          offset = updateId + 1;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching updates:', error);
  }
  setTimeout(() => listenForMessages(offset), 1000);
}

// Arranca chequeos automáticos cada 5 minutos
setInterval(checkAndNotify, 5 * 60 * 1000);

(async () => {
  listenForMessages();
  await checkAndNotify();
})();
