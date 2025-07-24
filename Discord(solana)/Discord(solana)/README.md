# Solana Discord Bundler Bot

A Discord bot for bundling Solana transactions with Phantom wallet integration.

## Features
- Phantom wallet connect via web
- Slash commands: `/connect`, `/bundle`, `/preview`, `/status`
- Solana transaction bundling
- Real-time status updates
- Optional: Gas tracker, mempool alerts

## Setup Instructions

### 1. Clone the repository
```
git clone <your-repo-url>
cd solana-discord-bundler-bot
```

### 2. Install dependencies
```
npm install
```

### 3. Configure environment variables
- Copy `.env.example` to `.env` and fill in your values:
```
cp .env.example .env
```
- Set your Discord bot token, port, and (later) your ngrok public URL.

### 4. Start the web server and bot
```
npm run dev
```

### 5. Expose your local web server using ngrok
- [Download ngrok](https://ngrok.com/)
- Run:
```
ngrok http 3000
```
- Copy the HTTPS URL ngrok gives you and set it as `BASE_URL` in your `.env` file.

### 6. Invite your bot to your Discord server
- Use the Discord Developer Portal to generate an invite link with the `applications.commands` and `bot` scopes.

### 7. Use the bot!
- Try `/connect` in your server to start the wallet connection process.

---

**Never share your .env file or bot token!** 