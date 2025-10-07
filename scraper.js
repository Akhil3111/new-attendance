/**
 * SCRAPER.JS
 * Selenium-based web scraper for attendance and Twilio messaging.
 */

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const twilio = require('twilio');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER,
  TWILIO_JOIN_CODE
} = process.env;

// Twilio client
const TWILIO_CLIENT = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

// Flag to detect local vs production
const IS_LOCAL = process.env.NODE_ENV !== 'production';
const CHROMEDRIVER_PATH = IS_LOCAL
  ? require('chromedriver').path
  : '/usr/bin/chromedriver';
const CHROME_BINARY_PATH = IS_LOCAL ? undefined : '/usr/bin/google-chrome';

// Send WhatsApp message
async function sendWhatsAppMessage(to_number, message) {
  if (!TWILIO_CLIENT) return { success: false, error: "Twilio not configured." };
  try {
    await TWILIO_CLIENT.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${to_number}`,
      body: message
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Format attendance message
function formatWhatsAppMessage(data) {
  const statusEmojis = { "Present": "✅ Present", "Absent": "❌ Absent" };
  let message = `📚 *Daily Attendance Report* 📚\n\n`;
  message += `✅ Total Attendance: *${data.total_percentage || 'N/A'}*\n\n`;
  message += "*Subject-wise Breakdown:*\n";
  for (const subject of data.subjects) {
    const statusText = statusEmojis[subject.status] || subject.status;
    message += `- ${subject.subject}: ${statusText}\n`;
  }
  return message;
}

// Core scraping logic
async function getAttendanceData(username, password) {
  let driver;
  try {
    const chromeOptions = new chrome.Options();
    chromeOptions.addArguments(
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1920,1080',
      '--disable-dev-shm-usage'
    );
    if (!IS_LOCAL) chromeOptions.setChromeBinaryPath(CHROME_BINARY_PATH);

    const service = new chrome.ServiceBuilder(CHROMEDRIVER_PATH);
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(chromeOptions)
      .setChromeService(service)
      .build();

    // 1. Go to login page
    await driver.get('https://login.vardhaman.org/');

    // Wait until username field is visible
    const usernameField = await driver.wait(
      until.elementLocated(By.name('txtuser')),
      60000
    );
    await driver.wait(until.elementIsVisible(usernameField), 60000);

    // Wait for password field
    const passwordField = await driver.wait(
      until.elementLocated(By.name('txtpass')),
      60000
    );
    await driver.wait(until.elementIsVisible(passwordField), 60000);

    // Wait for login button
    const loginBtn = await driver.wait(
      until.elementLocated(By.name('btnLogin')),
      60000
    );
    await driver.wait(until.elementIsVisible(loginBtn), 60000);

    // 2. Login
    await usernameField.sendKeys(username);
    await passwordField.sendKeys(password);
    await loginBtn.click();
    await driver.sleep(3000);

    // 3. Close pop-up if exists
    try {
      const popupClose = await driver.wait(
        until.elementLocated(By.xpath('//*[@id="ctl00_ContentPlaceHolder1_PopupCTRLMain_Image2"]')),
        5000
      );
      await driver.wait(until.elementIsVisible(popupClose), 5000);
      await popupClose.click();
    } catch (e) { /* ignore if no popup */ }

    await driver.sleep(2000);

    // 4. Navigate to Attendance
    const attendanceBtn = await driver.wait(
      until.elementLocated(By.xpath('//*[@id="ctl00_ContentPlaceHolder1_divAttendance"]/div[3]/a/div[2]')),
      10000
    );
    await driver.wait(until.elementIsVisible(attendanceBtn), 10000);
    await attendanceBtn.click();
    await driver.sleep(3000);

    // 5. Get total percentage
    let totalPercentage = 'N/A';
    try {
      const totalElem = await driver.wait(
        until.elementLocated(By.css('.attendance-count')),
        5000
      );
      await driver.wait(until.elementIsVisible(totalElem), 5000);
      totalPercentage = await totalElem.getText();
    } catch (e) { /* ignore */ }

    // 6. Get subject-wise details
    const subjectElems = await driver.findElements(By.css('.atten-sub.bus-stops ul li'));
    const subjects = [];

    for (let item of subjectElems) {
      const subject = await item.findElement(By.tagName('h5')).getText();
      const time_slot = await item.findElement(By.css('.stp-detail p.text-primary')).getText();
      const faculty = await item.findElement(By.css('.fac-status p.text-primary')).getText();
      const status = await item.findElement(By.css('.fac-status .status')).getText();
      subjects.push({ subject, time_slot, faculty, status });
    }

    return { total_percentage: totalPercentage, subjects };

  } catch (e) {
    console.error('Scraping failed:', e);
    return { error: e.message || 'Scraping failed.' };
  } finally {
    if (driver) await driver.quit();
  }
}

module.exports = {
  getAttendanceData,
  sendWhatsAppMessage,
  formatWhatsAppMessage
};
