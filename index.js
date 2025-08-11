async function getFlightsReport() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  // Cambiar user agent para parecer un navegador normal
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/115.0.0.0 Safari/537.36'
  );

  console.log('Navegando a arrivals page...');
  await page.goto('https://www.birminghamairport.co.uk/flights/arrivals/', { waitUntil: 'networkidle2' });

  try {
    await page.waitForSelector('.flights__row', { timeout: 10000 });
  } catch {
    console.log('Selector .flights__row no encontrado, puede que la página haya cambiado.');
  }

  const flightsData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.flights__row'));
    console.log('Filas encontradas:', rows.length);
    return rows.map(row => {
      const flightNumber = row.querySelector('.flights__flight-number')?.innerText.trim() || 'N/A';
      const origin = row.querySelector('.flights__origin')?.innerText.trim() || 'N/A';
      const scheduledTime = row.querySelector('.flights__scheduled-time')?.innerText.trim() || 'N/A';
      const status = row.querySelector('.flights__status')?.innerText.trim().toLowerCase() || '';
      return { flightNumber, origin, scheduledTime, status };
    });
  });

  console.log('Vuelos scrapeados:', flightsData.length);

  await browser.close();

  const now = new Date();
  const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const divertedFlights = flightsData.filter(f => f.status.includes('diverted'));

  const arrivalStatuses = ['expected', 'scheduled', 'on time', 'due'];
  const upcomingFlights = flightsData.filter(f => {
    if (!arrivalStatuses.some(s => f.status.includes(s))) return false;
    const flightDate = parseTimeToDate(f.scheduledTime);
    return flightDate >= now && flightDate <= threeHoursLater;
  });

  let report = '';

  if (divertedFlights.length > 0) {
    report += '🚨 *Diverted Flights:*\n';
    divertedFlights.forEach(f => {
      report += `• ${f.flightNumber} from ${f.origin} at ${f.scheduledTime}\n`;
    });
  } else {
    report += 'No diverted flights.\n';
  }

  if (upcomingFlights.length > 0) {
    report += '\n*Upcoming arrivals (next 3 hours):*\n';
    upcomingFlights.forEach(f => {
      report += `• ${f.flightNumber} from ${f.origin} at ${f.scheduledTime} — ${f.status}\n`;
    });
  } else {
    report += '\nNo upcoming arrivals in next 3 hours.';
  }

  return report;
}
