const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const { getAttendanceData, sendWhatsAppMessage, formatWhatsAppMessage } = require('./scraper');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Health check route
app.get('/api/scrape-status', (req, res) => {
  res.status(200).json({ status: 'Server running and healthy' });
});

// Scrape API endpoint
app.post('/api/scrape', async (req, res) => {
  const { userId, username, password, whatsapp } = req.body;
  if (!username || !password || !whatsapp) {
    return res.status(400).json({ error: 'Please fill all fields.' });
  }

  const scrapedData = await getAttendanceData(username, password);
  if (scrapedData.error) return res.status(500).json({ error: scrapedData.error });

  const reportMessage = formatWhatsAppMessage(scrapedData);
  const joinCode = process.env.TWILIO_JOIN_CODE || 'join-code';
  const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'your_twilio_number';
  const optInMessage = `\n\n📢 Send the code "${joinCode}" to ${twilioNumber} to opt-in.`;

  const { success, error } = await sendWhatsAppMessage(whatsapp, reportMessage + optInMessage);

  res.json({
    message: "Report sent (DB optional).",
    data: scrapedData,
    whatsappSuccess: success,
    optInInstruction: optInMessage
  });
});

// Catch-all: send index.html for any other route (for React frontend routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
