const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/flights', async (req, res) => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.goto('https://www.birminghamairport.co.uk/flights/arrivals/', { waitUntil: 'networkidle2' });

    // Esperamos un poco para que cargue el contenido dinámico
    await page.waitForTimeout(5000);

    // Scrapeamos la info de vuelos:
    const flights = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.flights__row'));
      return rows.map(row => {
        const flightNumber = row.querySelector('.flights__flight-number')?.innerText.trim() || null;
        const origin = row.querySelector('.flights__origin')?.innerText.trim() || null;
        const scheduledTime = row.querySelector('.flights__scheduled-time')?.innerText.trim() || null;
        const status = row.querySelector('.flights__status')?.innerText.trim() || null;

        return { flightNumber, origin, scheduledTime, status };
      });
    });

    await browser.close();

    res.json({ flights });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to scrape flights' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
