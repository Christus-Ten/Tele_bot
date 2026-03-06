const axios = require('axios'); // kept for consistency
const fs = require('fs');
const path = require('path');

// Helper (unused but kept for style)
async function getBaseApiUrl() {
  return 'https://www.noobs-api.rf.gd/dipto';
}

// In-memory store for message counts per chat per user
// Structure: { [chatId]: { [userId]: { count: number, firstName: string, lastName: string, username: string } } }
const messageCounts = {};

const nix = {
  name: 'count',
  version: '1.0.0',
  aliases: [],
  description: 'Shows a sorted count of messages from group members',
  author: 'Christus',
  prefix: true, // command requires prefix
  category: 'group',
  role: 0,
  cooldown: 3,
  guide: '{p}count'
};

async function onStart({ bot, msg, chatId, args }) {
  const chatCounts = messageCounts[chatId];
  if (!chatCounts || Object.keys(chatCounts).length === 0) {
    return bot.sendMessage(chatId, 'No message count data available for this chat.', {
      reply_to_message_id: msg.message_id
    });
  }

  // Convert to array and sort by count descending
  const sorted = Object.values(chatCounts).sort((a, b) => b.count - a.count);

  let response = '👑 | Count all members\n';
  for (let i = 0; i < sorted.length; i++) {
    const member = sorted[i];
    const name = member.firstName 
      ? (member.lastName ? `${member.firstName} ${member.lastName}` : member.firstName)
      : (member.username ? `@${member.username}` : `User ${member.userId}`);
    response += `${i + 1}/ ${name} : ${member.count} messages\n`;
  }

  await bot.sendMessage(chatId, response, {
    reply_to_message_id: msg.message_id
  });
}

async function onChat({ bot, msg }) {
  // Only count messages in groups/supergroups
  if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') return;

  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return; // shouldn't happen

  const userId = from.id;
  const firstName = from.first_name || '';
  const lastName = from.last_name || '';
  const username = from.username || '';

  // Initialize chat entry if needed
  if (!messageCounts[chatId]) messageCounts[chatId] = {};

  // Update count for this user
  const userEntry = messageCounts[chatId][userId] || {
    count: 0,
    userId,
    firstName,
    lastName,
    username
  };

  userEntry.count += 1;
  // Update name in case it changed
  userEntry.firstName = firstName;
  userEntry.lastName = lastName;
  userEntry.username = username;

  messageCounts[chatId][userId] = userEntry;
}

module.exports = { onStart, onChat, nix };
