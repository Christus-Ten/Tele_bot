const axios = require('axios'); // kept for consistency, not used here
const fs = require('fs');
const path = require('path');

// Placeholder – not used in this command but required for style uniformity
async function getBaseApiUrl() {
  return 'https://www.noobs-api.rf.gd/dipto';
}

const nix = {
  name: 'notify',
  version: '1.0.0',
  aliases: ['noti'],
  description: 'Send message to all groups',
  author: 'Christus',
  prefix: true, // command requires prefix (e.g., /notify)
  category: 'admin',
  role: 2, // 2 = bot owner/admin (adjust according to your role system)
  cooldown: 0,
  guide: '{p}notify <message>'
};

async function onStart({ bot, msg, chatId, args }) {
  const text = args.join(' ');
  if (!text) {
    return bot.sendMessage(chatId, '❌ Please provide a message', {
      reply_to_message_id: msg.message_id
    });
  }

  // Optional: additional admin check (you can hardcode your admin IDs here)
  const ADMIN_IDS = [msg.from.id]; // replace with your actual admin IDs
  if (!ADMIN_IDS.includes(msg.from.id)) {
    return bot.sendMessage(chatId, '⛔ You are not allowed to use this command', {
      reply_to_message_id: msg.message_id
    });
  }

  // global.chatIDs must be maintained by the bot (e.g., on each "join" event)
  // This array should contain all chat IDs where the bot is present.
  if (!global.chatIDs || !Array.isArray(global.chatIDs)) {
    return bot.sendMessage(chatId, '⚠️ No chat list available', {
      reply_to_message_id: msg.message_id
    });
  }

  let success = 0;
  let failed = 0;

  for (const targetChatId of global.chatIDs) {
    try {
      await bot.sendMessage(targetChatId, text);
      success++;
    } catch (error) {
      failed++;
    }
  }

  await bot.sendMessage(
    chatId,
    `✅ Notify done\n\n📨 Sent: ${success}\n❌ Failed: ${failed}`,
    { reply_to_message_id: msg.message_id }
  );
}

// No onChat needed – this command is only triggered by prefix

module.exports = { onStart, nix };
