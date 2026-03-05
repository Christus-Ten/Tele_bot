const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');

// ========== CONFIGURATION ==========
const nix = {
  name: "count",
  version: "3.0",
  aliases: ["msgcount", "messages"],
  description: "Affiche les statistiques de messages et le classement avec design moderne",
  author: "Christus",
  role: 0,
  category: "groupe",
  cooldown: 5,
  guide: `{p}count : Voir votre carte d'activité
{p}count @tag : Voir la carte d'un membre
{p}count all [page] : Voir le classement`
};

// ========== GESTION BASE DE DONNÉES ==========
const getDbPath = () => path.join(process.cwd(), 'database', 'count.json');

const getCountData = () => {
  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
};

const saveCountData = (data) => {
  const dbPath = getDbPath();
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

// ========== FONCTIONS UTILITAIRES ==========
function fitText(ctx, text, maxWidth, fontSize) {
  ctx.font = `bold ${fontSize}px "Arial", sans-serif`;
  let current = text;
  if (ctx.measureText(current).width > maxWidth) {
    while (ctx.measureText(current + '...').width > maxWidth && current.length > 1) {
      current = current.slice(0, -1);
    }
    return current + '...';
  }
  return current;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCircularAvatar(ctx, avatar, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

async function fetchAvatar(bot, userId) {
  try {
    const photos = await bot.getUserProfilePhotos(userId);
    if (photos.total_count > 0) {
      const fileId = photos.photos[0][0].file_id;
      const fileLink = await bot.getFileLink(fileId);
      const res = await axios.get(fileLink, { responseType: 'arraybuffer' });
      return await loadImage(Buffer.from(res.data));
    }
  } catch (e) {}
  // Avatar par défaut avec initiale
  const canvas = createCanvas(200, 200);
  const ctx = canvas.getContext('2d');
  const colors = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6'];
  ctx.fillStyle = colors[parseInt(userId) % colors.length];
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 100, 100);
  return canvas;
}

// ========== COMMANDE PRINCIPALE ==========
async function onStart({ bot, msg, chatId, args }) {
  const senderID = msg.from.id;
  const threadID = chatId; // Telegram: chatId est l'ID du groupe ou privé
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (!isGroup) {
    return bot.sendMessage(chatId, "❌ Cette commande n'est disponible que dans les groupes.", { reply_to_message_id: msg.message_id });
  }

  const data = getCountData();
  if (!data[threadID]) data[threadID] = {};

  // Mise à jour du nom du sender (optionnel, car on ne compte pas automatiquement)
  const senderName = msg.from.first_name || msg.from.username || "Membre";
  if (!data[threadID][senderID]) {
    data[threadID][senderID] = {
      count: 0,
      name: senderName,
      daily: {},
      types: { text: 0, sticker: 0, media: 0 },
      streak: 0,
      lastActive: null
    };
  } else {
    data[threadID][senderID].name = senderName;
  }
  saveCountData(data);

  // Construire la liste des utilisateurs du thread
  const members = Object.entries(data[threadID]).map(([uid, info]) => ({
    uid,
    name: info.name || "Membre",
    count: info.count || 0,
    activity: {
      daily: info.daily || {},
      types: info.types || { text: 0, sticker: 0, media: 0 },
      streak: info.streak || 0,
      lastActive: info.lastActive
    }
  }));

  // Trier par nombre de messages
  members.sort((a, b) => b.count - a.count);
  members.forEach((user, idx) => { user.rank = idx + 1; });

  // ========== COMMANDE "all" ==========
  if (args[0] && args[0].toLowerCase() === 'all') {
    const page = parseInt(args[1]) || 1;
    const perPage = 10;
    const totalPages = Math.ceil(members.length / perPage) || 1;
    if (page < 1 || page > totalPages) {
      return bot.sendMessage(chatId, "❌ Numéro de page invalide.", { reply_to_message_id: msg.message_id });
    }

    const start = (page - 1) * perPage;
    const pageUsers = members.slice(start, start + perPage);

    // Canvas pour le leaderboard
    const canvas = createCanvas(1200, 1600);
    const ctx = canvas.getContext('2d');

    // Thème
    const theme = {
      primary: '#6366F1', secondary: '#8B5CF6', accent: '#EC4899',
      bg: ['#0F172A', '#1E293B'], cardBg: 'rgba(30, 41, 59, 0.7)',
      text: '#F1F5F9', muted: '#94A3B8'
    };

    // Fond dégradé
    const gradient = ctx.createLinearGradient(0, 0, 1200, 1600);
    gradient.addColorStop(0, theme.bg[0]);
    gradient.addColorStop(1, theme.bg[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 1600);

    // Titre
    ctx.fillStyle = theme.cardBg;
    drawRoundedRect(ctx, 40, 40, 1120, 120, 20);
    ctx.fill();
    ctx.fillStyle = theme.primary;
    ctx.font = 'bold 65px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = theme.primary;
    ctx.shadowBlur = 15;
    ctx.fillText('CLASSEMENT', 600, 120);
    ctx.shadowBlur = 0;

    // Top 3
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.muted;
    ctx.font = 'bold 30px Arial';
    ctx.fillText('TOP 3', 60, 230);

    const top3 = members.slice(0, 3);
    const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    for (let i = 0; i < 3; i++) {
      const user = top3[i];
      if (!user) continue;
      const cardX = 60 + i * 380;
      const cardY = 260;

      ctx.fillStyle = theme.cardBg;
      drawRoundedRect(ctx, cardX, cardY, 340, 200, 20);
      ctx.fill();

      ctx.fillStyle = medalColors[i];
      drawRoundedRect(ctx, cardX + 20, cardY + 20, 60, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`#${user.rank}`, cardX + 50, cardY + 42);

      const avatar = await fetchAvatar(bot, user.uid);
      drawCircularAvatar(ctx, avatar, cardX + 170, cardY + 90, 50);

      ctx.fillStyle = theme.text;
      ctx.font = 'bold 24px Arial';
      ctx.fillText(fitText(ctx, user.name, 300, 24), cardX + 170, cardY + 170);
      ctx.fillStyle = theme.accent;
      ctx.fillText(user.count, cardX + 170, cardY + 200);
    }

    // Liste des autres membres
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.muted;
    ctx.font = 'bold 28px Arial';
    ctx.fillText('AUTRES MEMBRES', 60, 520);

    let currentY = 560;
    for (let i = 0; i < pageUsers.length; i++) {
      const user = pageUsers[i];
      const y = currentY + i * 85;

      ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 41, 59, 0.5)' : 'rgba(30, 41, 59, 0.3)';
      drawRoundedRect(ctx, 60, y, 1080, 70, 15);
      ctx.fill();

      ctx.fillStyle = theme.muted;
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(start + i + 1, 120, y + 48);

      const avatar = await fetchAvatar(bot, user.uid);
      drawCircularAvatar(ctx, avatar, 180, y + 35, 25);

      ctx.textAlign = 'left';
      ctx.fillStyle = theme.text;
      ctx.font = 'bold 26px Arial';
      ctx.fillText(fitText(ctx, user.name, 400, 26), 220, y + 48);

      ctx.textAlign = 'right';
      ctx.fillStyle = theme.primary;
      ctx.fillText(user.count, 1100, y + 48);

      // Barre de progression
      const maxCount = members[0]?.count || 1;
      const progress = (user.count / maxCount) * 400;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
      drawRoundedRect(ctx, 680, y + 20, 400, 30, 15);
      ctx.fill();
      const barGrad = ctx.createLinearGradient(680, 0, 680 + progress, 0);
      barGrad.addColorStop(0, theme.primary);
      barGrad.addColorStop(1, theme.secondary);
      ctx.fillStyle = barGrad;
      drawRoundedRect(ctx, 680, y + 20, progress, 30, 15);
      ctx.fill();
    }

    // Pagination
    ctx.fillStyle = theme.cardBg;
    drawRoundedRect(ctx, 400, 1450, 400, 80, 20);
    ctx.fill();
    ctx.fillStyle = theme.text;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Page ${page}/${totalPages}`, 600, 1490);
    ctx.fillStyle = theme.muted;
    ctx.font = '20px Arial';
    ctx.fillText('Répondez avec un numéro de page', 600, 1530);

    // Sauvegarde et envoi
    const cacheDir = path.join(process.cwd(), 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `leaderboard_${threadID}_${page}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));

    const sentMsg = await bot.sendPhoto(chatId, fs.createReadStream(filePath), {
      reply_to_message_id: msg.message_id
    });

    fs.unlink(filePath, (err) => {
      if (err) console.error("Erreur suppression leaderboard:", err);
    });

    // Stocker pour la réponse (pagination)
    global.teamnix.replies.set(sentMsg.message_id, {
      nix,
      type: "count_leaderboard",
      authorId: senderID,
      threadID,
      page
    });

    return;
  }

  // ========== COMMANDE PAR DÉFAUT : CARTE UTILISATEUR ==========
  // Déterminer la cible : mention ou soi-même
  let targetID = senderID;
  let targetName = senderName;
  if (msg.reply_to_message) {
    targetID = msg.reply_to_message.from.id;
    targetName = msg.reply_to_message.from.first_name || "Membre";
  } else if (msg.entities && msg.entities[0]?.type === 'mention') {
    // Gestion basique des mentions (si le bot peut résoudre)
    // Dans Telegram, les mentions sont @username, on ne peut pas facilement obtenir l'ID
    // On ignore pour simplifier, on utilisera le reply
  }

  const user = members.find(u => u.uid === String(targetID));
  if (!user) {
    return bot.sendMessage(chatId, `❌ Aucune donnée pour cet utilisateur.`, { reply_to_message_id: msg.message_id });
  }

  // Création de la carte utilisateur
  const canvas = createCanvas(900, 1300);
  const ctx = canvas.getContext('2d');

  const theme = {
    primary: '#3B82F6', secondary: '#8B5CF6', accent: '#10B981',
    bg: ['#0F172A', '#1E293B'], cardBg: 'rgba(30, 41, 59, 0.9)',
    text: '#F8FAFC', muted: '#94A3B8', warning: '#F59E0B', danger: '#EF4444'
  };

  // Fond
  const bgGrad = ctx.createLinearGradient(0, 0, 900, 1300);
  bgGrad.addColorStop(0, theme.bg[0]);
  bgGrad.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 900, 1300);

  // Carte principale
  ctx.fillStyle = theme.cardBg;
  drawRoundedRect(ctx, 30, 30, 840, 1240, 30);
  ctx.fill();

  // En-tête dégradé
  const headerGrad = ctx.createLinearGradient(30, 30, 870, 200);
  headerGrad.addColorStop(0, theme.primary);
  headerGrad.addColorStop(1, theme.secondary);
  ctx.fillStyle = headerGrad;
  drawRoundedRect(ctx, 30, 30, 840, 200, 30);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 50px Arial';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = 10;
  ctx.fillText('CARTE D\'ACTIVITÉ', 450, 120);
  ctx.shadowBlur = 0;

  // Avatar
  const avatar = await fetchAvatar(bot, targetID);
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(450, 320, 85, 0, Math.PI * 2);
  ctx.stroke();
  drawCircularAvatar(ctx, avatar, 450, 320, 80);

  // Nom
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 36px Arial';
  ctx.fillText(fitText(ctx, user.name, 600, 36), 450, 440);

  // Statistiques
  ctx.fillStyle = theme.muted;
  ctx.font = 'bold 22px Arial';
  ctx.fillText('STATISTIQUES', 450, 500);

  const stats = [
    { x: 225, label: 'RANG', value: `#${user.rank}`, icon: '🏆', color: theme.warning },
    { x: 450, label: 'MESSAGES', value: user.count, icon: '💬', color: theme.primary },
    { x: 675, label: 'SÉRIE', value: `${user.activity.streak}j`, icon: '🔥', color: theme.danger }
  ];

  stats.forEach(stat => {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    drawRoundedRect(ctx, stat.x - 100, 500, 200, 140, 20);
    ctx.fill();
    ctx.fillStyle = stat.color;
    ctx.font = '48px "Segoe UI Emoji", Arial';
    ctx.fillText(stat.icon, stat.x, 550);
    ctx.font = 'bold 40px Arial';
    ctx.fillText(stat.value, stat.x, 600);
    ctx.fillStyle = theme.muted;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(stat.label, stat.x, 635);
  });

  // Graphique hebdomadaire
  ctx.textAlign = 'left';
  ctx.fillStyle = theme.muted;
  ctx.font = 'bold 24px Arial';
  ctx.fillText('ACTIVITÉ (7 JOURS)', 80, 720);

  const daily = user.activity.daily;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = moment().tz('Asia/Dhaka').subtract(i, 'days');
    const key = day.format('YYYY-MM-DD');
    days.push({ label: day.format('ddd'), count: daily[key] || 0 });
  }

  const max = Math.max(1, ...days.map(d => d.count));
  const chartX = 55, chartY = 750, chartW = 790, chartH = 180, barW = 80;

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 15);
  ctx.fill();

  days.forEach((day, i) => {
    const x = chartX + 40 + i * (barW + 30);
    const h = day.count > 0 ? (day.count / max) * (chartH - 60) : 5;
    const y = chartY + chartH - h - 30;

    if (day.count > 0) {
      const barGrad = ctx.createLinearGradient(x, y, x, y + h);
      barGrad.addColorStop(0, theme.primary);
      barGrad.addColorStop(1, theme.secondary);
      ctx.fillStyle = barGrad;
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
    }
    drawRoundedRect(ctx, x, y, barW, h, 10);
    ctx.fill();

    ctx.fillStyle = day.count > 0 ? theme.text : theme.muted;
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(day.label, x + barW/2, chartY + chartH - 5);
    if (day.count > 0) {
      ctx.fillStyle = theme.text;
      ctx.font = 'bold 16px Arial';
      ctx.fillText(day.count, x + barW/2, y - 10);
    }
  });

  // Répartition des types
  ctx.textAlign = 'left';
  ctx.fillStyle = theme.muted;
  ctx.font = 'bold 24px Arial';
  ctx.fillText('RÉPARTITION', 80, 990);

  const types = user.activity.types;
  const total = types.text + types.sticker + types.media;
  const breakdown = [
    { label: 'Texte', val: types.text, col: theme.primary, icon: '📝' },
    { label: 'Sticker', val: types.sticker, col: theme.accent, icon: '🎨' },
    { label: 'Média', val: types.media, col: theme.warning, icon: '🖼️' }
  ];

  // Petit donut simple
  const donutX = 150, donutY = 1080;
  if (total > 0) {
    let startAngle = -0.5 * Math.PI;
    breakdown.forEach(b => {
      if (b.val > 0) {
        const angle = (b.val / total) * 2 * Math.PI;
        ctx.fillStyle = b.col;
        ctx.beginPath();
        ctx.moveTo(donutX, donutY);
        ctx.arc(donutX, donutY, 70, startAngle, startAngle + angle);
        ctx.fill();
        startAngle += angle;
      }
    });
  } else {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.beginPath();
    ctx.arc(donutX, donutY, 70, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = theme.bg[1];
  ctx.beginPath();
  ctx.arc(donutX, donutY, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(total, donutX, donutY + 8);

  // Légende
  let legY = 1050;
  breakdown.forEach(b => {
    const pct = total > 0 ? ((b.val / total) * 100).toFixed(1) : '0.0';
    ctx.fillStyle = b.col;
    ctx.font = '28px "Segoe UI Emoji", Arial';
    ctx.fillText(b.icon, 300, legY + 25);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(b.label, 340, legY + 25);
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.fillText(`${pct}% (${b.val})`, 800, legY + 25);
    legY += 50;
  });

  // Pied de page
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.muted;
  ctx.font = 'italic 18px Arial';
  ctx.fillText(`Généré à ${moment().format('HH:mm:ss')}`, 450, 1270);

  // Sauvegarde et envoi
  const cacheDir = path.join(process.cwd(), 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, `usercard_${targetID}.png`);
  fs.writeFileSync(filePath, canvas.toBuffer('image/png'));

  await bot.sendPhoto(chatId, fs.createReadStream(filePath), {
    reply_to_message_id: msg.message_id
  });

  fs.unlink(filePath, (err) => {
    if (err) console.error("Erreur suppression usercard:", err);
  });
}

// ========== GESTIONNAIRE DE RÉPONSE (PAGINATION) ==========
async function onReply({ bot, msg, chatId, userId, data }) {
  if (!data || data.type !== "count_leaderboard" || userId !== data.authorId) return;

  const page = parseInt(msg.text);
  if (isNaN(page) || page < 1) {
    return bot.sendMessage(chatId, "❌ Numéro de page invalide.", { reply_to_message_id: msg.message_id });
  }

  // Simuler un nouvel appel à onStart avec "all" et la page
  const fakeArgs = ['all', page.toString()];
  await onStart({ bot, msg, chatId, args: fakeArgs });
}

module.exports = { nix, onStart, onReply };