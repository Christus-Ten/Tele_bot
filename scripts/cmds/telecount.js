const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');

const nix = {
  name: "count",
  version: "3.0",
  aliases: ["msgcount", "messages"],
  description: "Compteur de messages avec classement et carte d'activité",
  author: "Christus",
  role: 0,
  category: "groupe",
  cooldown: 5,
  guide: `{p}count : Voir votre position
{p}count [répondre à un message] : Voir la position d'un membre
{p}count all [page] : Voir le classement complet`
};

const getThreadPath = (threadId) => {
  const dir = path.join(process.cwd(), 'database', 'count');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${threadId}.json`);
};

const getThreadData = (threadId) => {
  const filePath = getThreadPath(threadId);
  if (!fs.existsSync(filePath)) {
    const defaultData = { users: {} };
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const saveThreadData = (threadId, data) => {
  const filePath = getThreadPath(threadId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

function getOrdinalSuffix(rank) {
  const j = rank % 10, k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}er`;
  if (j === 2 && k !== 12) return `${rank}ème`;
  if (j === 3 && k !== 13) return `${rank}ème`;
  return `${rank}ème`;
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

async function onMessage({ bot, msg }) {
  try {
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') return;

    const chatId = msg.chat.id;
    const senderId = msg.from.id;
    const senderName = msg.from.first_name || msg.from.username || 'Membre';
    const now = moment().tz('Asia/Dhaka').format('YYYY-MM-DD');
    const yesterday = moment().tz('Asia/Dhaka').subtract(1, 'days').format('YYYY-MM-DD');

    const threadData = getThreadData(chatId);
    if (!threadData.users[senderId]) {
      threadData.users[senderId] = {
        name: senderName,
        count: 0,
        daily: {},
        types: { text: 0, sticker: 0, media: 0 },
        streak: 0,
        lastActive: null
      };
    } else {
      threadData.users[senderId].name = senderName;
    }

    const user = threadData.users[senderId];
    user.count = (user.count || 0) + 1;

    if (!user.daily) user.daily = {};
    user.daily[now] = (user.daily[now] || 0) + 1;

    if (!user.types) user.types = { text: 0, sticker: 0, media: 0 };
    const hasAttachments = msg.attachments && msg.attachments.length > 0;
    if (hasAttachments) {
      const isSticker = msg.attachments.some(a => a.type === 'sticker');
      if (isSticker) user.types.sticker = (user.types.sticker || 0) + 1;
      else user.types.media = (user.types.media || 0) + 1;
    } else {
      user.types.text = (user.types.text || 0) + 1;
    }

    if (!user.lastActive) {
      user.streak = 1;
    } else if (user.lastActive !== now) {
      if (user.lastActive === yesterday) {
        user.streak = (user.streak || 0) + 1;
      } else {
        user.streak = 1;
      }
    }
    user.lastActive = now;

    const keys = Object.keys(user.daily).sort();
    if (keys.length > 7) {
      const newDaily = {};
      keys.slice(-7).forEach(k => newDaily[k] = user.daily[k]);
      user.daily = newDaily;
    }

    saveThreadData(chatId, threadData);
  } catch (error) {
    console.error('Erreur dans onMessage (count):', error);
  }
}

async function onStart({ bot, msg, chatId, args }) {
  try {
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      return bot.sendMessage(chatId, '❌ Cette commande fonctionne uniquement dans les groupes.', { reply_to_message_id: msg.message_id });
    }

    const threadData = getThreadData(chatId);
    const usersArray = Object.entries(threadData.users).map(([userId, data]) => ({
      userId,
      name: data.name || 'Membre',
      count: data.count || 0,
      ...data
    }));
    usersArray.sort((a, b) => b.count - a.count);

    if (args[0] && args[0].toLowerCase() === 'all') {
      const page = parseInt(args[1]) || 1;
      const perPage = 10;
      const totalPages = Math.ceil(usersArray.length / perPage) || 1;
      if (page < 1 || page > totalPages) {
        return bot.sendMessage(chatId, '❌ Numéro de page invalide.', { reply_to_message_id: msg.message_id });
      }

      const start = (page - 1) * perPage;
      const pageUsers = usersArray.slice(start, start + perPage);

      let text = `🏆 CLASSEMENT DES MESSAGES\n`;
      text += `📊 Page ${page}/${totalPages}\n\n`;
      pageUsers.forEach((user, idx) => {
        const rank = start + idx + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '📌';
        text += `${medal} #${rank} ${user.name}\n`;
        text += `   💬 ${formatNumber(user.count)} messages\n`;
        if (user.types) {
          text += `   📝 ${user.types.text || 0} | 🎨 ${user.types.sticker || 0} | 🖼️ ${user.types.media || 0}\n`;
        }
        text += `   🔥 Série: ${user.streak || 0} jours\n\n`;
      });
      text += `👤 Votre position: #${usersArray.findIndex(u => u.userId === msg.from.id) + 1 || '?'}`;

      return bot.sendMessage(chatId, text, { reply_to_message_id: msg.message_id });
    }

    let targetId = msg.from.id;
    let targetName = msg.from.first_name || 'Membre';

    if (msg.reply_to_message) {
      targetId = msg.reply_to_message.from.id;
      targetName = msg.reply_to_message.from.first_name || 'Membre';
    }

    const userIndex = usersArray.findIndex(u => u.userId === targetId);
    if (userIndex === -1) {
      return bot.sendMessage(chatId, `❌ Aucune donnée pour cet utilisateur. Envoyez d'abord des messages.`, { reply_to_message_id: msg.message_id });
    }

    const user = usersArray[userIndex];
    const rank = userIndex + 1;
    const totalUsers = usersArray.length;
    const percentile = ((totalUsers - rank) / totalUsers * 100).toFixed(1);

    const daily = user.daily || {};
    const days = Object.keys(daily).sort().slice(-7);
    const avgDaily = days.length ? (days.reduce((acc, d) => acc + daily[d], 0) / days.length).toFixed(1) : 0;

    const text = `
👤 ${user.name}
📊 Statistiques de messages

🏆 Position : #${rank} sur ${totalUsers} (Top ${percentile}%)
💬 Total : ${formatNumber(user.count)} messages
🔥 Série actuelle : ${user.streak || 0} jours
📈 Moyenne (7j) : ${avgDaily} messages/jour

📝 Répartition :
   • Texte : ${user.types?.text || 0}
   • Stickers : ${user.types?.sticker || 0}
   • Médias : ${user.types?.media || 0}

📅 Activité récente : ${days.map(d => `${d.slice(5)}: ${daily[d]}`).join(', ')}
    `;

    return bot.sendMessage(chatId, text, { reply_to_message_id: msg.message_id });

  } catch (error) {
    console.error('Erreur dans count onStart:', error);
    bot.sendMessage(chatId, '❌ Une erreur est survenue.', { reply_to_message_id: msg.message_id });
  }
}

module.exports = {
  nix,
  onStart,
  onMessage
};
