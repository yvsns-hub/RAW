# KIET College Deployment Guide 🎓

Hosting **RAW** on your college's internal network or a dedicated local server will significantly improve performance and eliminate the "sleep/cold-start" issues of Render's free tier.

## Why Deploy Locally at KIET?
1. **Low Latency:** Faster access to university result portals if they are on the same network.
2. **No Sleeping:** Your server stays active 24/7 without being spun down for inactivity.
3. **Higher Resources:** Most desktop PCs or local servers have more than 512MB RAM, making the scraper much more stable.

---

## Deployment Steps (Windows Server / Lab PC)

### 1. Prerequisites
- **Node.js:** Install Node.js v20.x or higher from [nodejs.org](https://nodejs.org/).
- **Git:** Install Git if you need to clone the repo directly.

### 2. Setup Project
1. Open PowerShell or Command Prompt.
2. Navigate to your project folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Install **PM2** (Process Manager) to keep the app running forever:
   ```bash
   npm install -g pm2
   ```

### 3. Start the Server
Run the following command to start the server:
```bash
pm2 start server.js --name "RAW-Automation"
```
To ensure it starts automatically after a reboot:
```bash
pm2 save
npm install -g pm2-windows-startup
pm2-startup install
```

### 4. Network Access
- Find your local IP (e.g., `192.168.1.50`) by running `ipconfig`.
- Other students on the same Wi-Fi/Network can now access the site at `http://192.168.1.50:3000`.
- **Note:** You may need to open Port 3000 in the Windows Firewall.

---

## Deployment Steps (Linux/Ubuntu Server)

1. **Install Node & PM2:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```
2. **Install Chromium dependencies (for Scraper):**
   ```bash
   sudo apt-get install -y libnss3 libatk-bridge2.0-0 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libasound2
   ```
3. **Run App:**
   ```bash
   pm2 start server.js --name "RAW-Automation"
   pm2 startup
   pm2 save
   ```

---

## Fixing Render "Waking Up" (If staying on Render)
If you decide to stay on Render, use a free service like **[Cron-job.org](https://cron-job.org/)** or **[UptimeRobot](https://uptimerobot.com/)**:
- **Target URL:** `https://your-app-name.onrender.com/api/ping`
- **Interval:** Every 14 minutes.
- This will keep the instance "awake" and prevent the 30-60s delay for users.
