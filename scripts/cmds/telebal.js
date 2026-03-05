const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const axios = require("axios");

// ========== CONFIGURATION ==========
const CONFIG = {
    currency: {
        symbol: "$",
        name: "Dollar",
        decimalPlaces: 2
    },
    transfer: {
        minAmount: 10,
        maxAmount: 1000000,
        taxRates: [
            { max: 1000, rate: 2 },
            { max: 10000, rate: 5 },
            { max: 50000, rate: 8 },
            { max: 100000, rate: 10 },
            { max: 500000, rate: 12 },
            { max: 1000000, rate: 15 }
        ],
        dailyLimit: 500000
    },
    dailyBonus: {
        baseAmount: 100,
        streakMultiplier: 0.1,
        maxStreak: 30,
        resetHours: 21
    },
    card: {
        width: 1000,
        height: 500,
        borderRadius: 30,
        glowIntensity: 25
    },
    tiers: [
        { name: "Starter", min: 0, max: 999, color: "#cd7f32", badge: "🥉", multiplier: 1.0 },
        { name: "Rookie", min: 1000, max: 4999, color: "#c0c0c0", badge: "🥈", multiplier: 1.1 },
        { name: "Pro", min: 5000, max: 19999, color: "#ffd700", badge: "🥇", multiplier: 1.2 },
        { name: "Elite", min: 20000, max: 49999, color: "#e5e4e2", badge: "💎", multiplier: 1.3 },
        { name: "Master", min: 50000, max: 99999, color: "#0ff", badge: "👑", multiplier: 1.5 },
        { name: "Legend", min: 100000, max: 499999, color: "#ff00ff", badge: "🌟", multiplier: 2.0 },
        { name: "God", min: 500000, max: Infinity, color: "#ff0000", badge: "⚡", multiplier: 3.0 }
    ]
};

// ========== GESTION BASE DE DONNÉES ==========
const getDbPath = () => path.join(process.cwd(), 'database', 'balance.json');

const getBalanceData = () => {
    const dbPath = getDbPath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({}));
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
};

const saveBalanceData = (data) => {
    const dbPath = getDbPath();
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

// ========== FONCTIONS UTILITAIRES ==========
function formatMoney(amount) {
    if (isNaN(amount) || amount === null || amount === undefined) {
        return `${CONFIG.currency.symbol}0`;
    }
    amount = Number(amount);
    if (amount === Infinity) return `${CONFIG.currency.symbol}∞`;
    if (amount === -Infinity) return `${CONFIG.currency.symbol}-∞`;
    if (!isFinite(amount)) return `${CONFIG.currency.symbol}NaN`;

    const scales = [
        { value: 1e18, suffix: "Qi" },
        { value: 1e15, suffix: "Qa" },
        { value: 1e12, suffix: "T" },
        { value: 1e9, suffix: "B" },
        { value: 1e6, suffix: "M" },
        { value: 1e3, suffix: "K" }
    ];
    const scale = scales.find(s => Math.abs(amount) >= s.value);
    if (scale) {
        const scaled = amount / scale.value;
        const formatted = Math.abs(scaled).toFixed(CONFIG.currency.decimalPlaces);
        const clean = formatted.endsWith(".00") ? formatted.slice(0, -3) : formatted;
        return `${amount < 0 ? "-" : ""}${CONFIG.currency.symbol}${clean}${scale.suffix}`;
    }
    const parts = Math.abs(amount).toFixed(CONFIG.currency.decimalPlaces).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${amount < 0 ? "-" : ""}${CONFIG.currency.symbol}${parts.join(".")}`;
}

function getTierInfo(balance) {
    const valid = Number(balance) || 0;
    for (let i = 0; i < CONFIG.tiers.length; i++) {
        const tier = CONFIG.tiers[i];
        if (valid >= tier.min && valid <= tier.max) {
            const next = CONFIG.tiers[i + 1] || null;
            const progress = tier.max === Infinity ? 100 : Math.min(100, ((valid - tier.min) / (tier.max - tier.min)) * 100);
            return { ...tier, nextTier: next, progress };
        }
    }
    return { name: "Unknown", color: "#888", badge: "❓", multiplier: 1, progress: 0, nextTier: null };
}

function calculateTax(amount) {
    let rate = 0;
    for (const r of CONFIG.transfer.taxRates) {
        if (amount <= r.max) { rate = r.rate; break; }
    }
    if (rate === 0) rate = CONFIG.transfer.taxRates[CONFIG.transfer.taxRates.length - 1].rate;
    const tax = Math.ceil((amount * rate) / 100);
    return { rate, tax, total: amount + tax, netAmount: amount };
}

function generateTransactionID() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `TX${timestamp}${random}`.toUpperCase();
}

function createRoundedRect(ctx, x, y, w, h, r) {
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

function drawProgressBar(ctx, x, y, w, h, progress, color) {
    ctx.save();
    ctx.fillStyle = "#333";
    createRoundedRect(ctx, x, y, w, h, h/2);
    ctx.fill();
    const pw = Math.max(5, (progress/100) * w);
    ctx.fillStyle = color;
    createRoundedRect(ctx, x, y, pw, h, h/2);
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    createRoundedRect(ctx, x, y, w, h, h/2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(progress)}%`, x + w/2, y + h/2 + 4);
    ctx.restore();
}

function drawBanknote(ctx, x, y, w, h, value, color) {
    ctx.save();
    ctx.fillStyle = color + "20";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color + "80";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color + "10";
    for (let i = 0; i < w; i += 20) {
        for (let j = 0; j < h; j += 20) {
            if ((i + j) % 40 === 0) ctx.fillRect(x + i, y + j, 10, 10);
        }
    }
    ctx.fillStyle = color;
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(formatMoney(value), x + w/2, y + h/2 + 5);
    ctx.font = "20px Arial";
    ctx.fillText(CONFIG.currency.symbol, x + w/2, y + h/2 - 15);
    ctx.restore();
}

async function fetchAvatar(bot, userId) {
    try {
        const photos = await bot.getUserProfilePhotos(userId);
        if (photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const fileLink = await bot.getFileLink(fileId);
            const res = await axios.get(fileLink, { responseType: "arraybuffer" });
            return await loadImage(Buffer.from(res.data));
        }
    } catch (e) {
        console.log("Avatar fetch error:", e.message);
    }
    // Fallback : avatar texte
    const canvas = createCanvas(150, 150);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#3b0066";
    ctx.fillRect(0, 0, 150, 150);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 60px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 75, 75);
    return canvas;
}

// ========== COMMANDE PRINCIPALE ==========
const nix = {
    name: "balance",
    version: "6.0",
    aliases: ["bal", "money", "cash", "solde"],
    description: "Système économique avancé avec carte visuelle, transferts, bonus quotidien et classement",
    author: "Christus",
    role: 0,
    category: "economy",
    cooldown: 3,
    guide: `{p}bal : Voir votre solde (carte)
{p}bal [répondre à qqn] : Voir le solde d'un autre
{p}bal transfer [montant] : Transférer de l'argent (en répondant)
{p}bal daily : Bonus quotidien
{p}bal rank : Voir votre rang et tier
{p}bal top [page] : Classement des plus riches`
};

async function onStart({ bot, msg, chatId, args }) {
    const senderID = msg.from.id;
    const senderName = msg.from.first_name || msg.from.username || "Utilisateur";
    const balances = getBalanceData();

    // Mettre à jour le nom du sender
    if (!balances[senderID]) balances[senderID] = { money: 0 };
    balances[senderID].name = senderName;
    saveBalanceData(balances);

    const command = args[0]?.toLowerCase();

    // ========== DAILY BONUS ==========
    if (command === "daily") {
        const user = balances[senderID] || { money: 0 };
        const now = Date.now();
        const last = user.lastDaily || 0;
        const streak = user.dailyStreak || 0;
        const hoursSince = (now - last) / (1000 * 60 * 60);

        if (hoursSince < CONFIG.dailyBonus.resetHours) {
            const left = Math.ceil(CONFIG.dailyBonus.resetHours - hoursSince);
            return bot.sendMessage(chatId, 
                `⏰ Vous avez déjà réclamé votre bonus aujourd'hui !\n🔄 Prochain bonus dans ${left}h\n🔥 Série actuelle : ${streak} jours`,
                { reply_to_message_id: msg.message_id }
            );
        }

        const base = CONFIG.dailyBonus.baseAmount;
        const streakBonus = Math.min(streak * CONFIG.dailyBonus.streakMultiplier * base, base * 5);
        const total = Math.round(base + streakBonus);
        const newStreak = hoursSince < CONFIG.dailyBonus.resetHours * 2 ? streak + 1 : 1;

        balances[senderID].money = (user.money || 0) + total;
        balances[senderID].lastDaily = now;
        balances[senderID].dailyStreak = newStreak;
        saveBalanceData(balances);

        return bot.sendMessage(chatId,
            `🎉 BONUS QUOTIDIEN 🎉\n\n` +
            `💰 Base : ${formatMoney(base)}\n` +
            `🔥 Série : ${formatMoney(streakBonus)}\n` +
            `🎁 Total reçu : ${formatMoney(total)}\n\n` +
            `📈 Nouvelle série : ${newStreak} jour${newStreak > 1 ? 's' : ''}\n` +
            `💵 Nouveau solde : ${formatMoney(balances[senderID].money)}`,
            { reply_to_message_id: msg.message_id }
        );
    }

    // ========== RANK ==========
    if (command === "rank") {
        const user = balances[senderID] || { money: 0 };
        const balance = user.money || 0;
        const tier = getTierInfo(balance);

        // Calcul du classement global
        const allUsers = Object.entries(balances).map(([id, data]) => ({ id, money: data.money || 0 }));
        const sorted = allUsers.sort((a, b) => b.money - a.money);
        const rank = sorted.findIndex(u => u.id === senderID) + 1;
        const total = sorted.length;

        const msgText = 
            `🏆 VOTRE RANG\n\n` +
            `👤 ${user.name || senderName}\n` +
            `💰 ${formatMoney(balance)}\n` +
            `🥇 Tier : ${tier.badge} ${tier.name}\n` +
            `📊 Classement : #${rank}/${total}\n` +
            `📈 Progression : ${tier.progress.toFixed(1)}%\n` +
            (tier.nextTier ? `🎯 Prochain tier : ${tier.nextTier.name} (${formatMoney(tier.nextTier.min - balance)} requis)` : '✨ Tier maximum atteint !');
        return bot.sendMessage(chatId, msgText, { reply_to_message_id: msg.message_id });
    }

    // ========== LEADERBOARD (TOP) ==========
    if (command === "top") {
        const page = parseInt(args[1]) || 1;
        const perPage = 10;
        const allUsers = Object.entries(balances)
            .map(([id, data]) => ({ id, name: data.name || "Inconnu", money: data.money || 0 }))
            .filter(u => u.money > 0)
            .sort((a, b) => b.money - a.money);

        const totalPages = Math.ceil(allUsers.length / perPage);
        const start = (page - 1) * perPage;
        const end = start + perPage;
        const pageUsers = allUsers.slice(start, end);

        if (pageUsers.length === 0) {
            return bot.sendMessage(chatId, "📭 Aucun utilisateur sur cette page.", { reply_to_message_id: msg.message_id });
        }

        let text = `🏆 CLASSEMENT MONDIAL (Page ${page}/${totalPages}) 🏆\n\n`;
        pageUsers.forEach((u, i) => {
            const globalRank = start + i + 1;
            const emoji = globalRank === 1 ? "🥇" : globalRank === 2 ? "🥈" : globalRank === 3 ? "🥉" : "🏅";
            const tier = getTierInfo(u.money);
            text += `${emoji} #${globalRank} ${u.name}\n   💰 ${formatMoney(u.money)} ${tier.badge}\n\n`;
        });

        const userRank = allUsers.findIndex(u => u.id === senderID) + 1;
        text += `👤 Votre position : #${userRank || '?'}`;
        return bot.sendMessage(chatId, text, { reply_to_message_id: msg.message_id });
    }

    // ========== TRANSFERT ==========
    if (command === "transfer" || command === "send" || command === "pay") {
        const targetMsg = msg.reply_to_message;
        const amountRaw = args[1] ? parseFloat(args[1]) : NaN;
        const amount = isNaN(amountRaw) ? 0 : Math.floor(amountRaw);

        if (!targetMsg) {
            return bot.sendMessage(chatId, "❌ Vous devez répondre au message de la personne à qui vous voulez envoyer de l'argent.", { reply_to_message_id: msg.message_id });
        }
        if (amount < CONFIG.transfer.minAmount || amount > CONFIG.transfer.maxAmount) {
            return bot.sendMessage(chatId, `❌ Le montant doit être entre ${formatMoney(CONFIG.transfer.minAmount)} et ${formatMoney(CONFIG.transfer.maxAmount)}.`, { reply_to_message_id: msg.message_id });
        }

        const targetID = targetMsg.from.id;
        if (targetID === senderID) {
            return bot.sendMessage(chatId, "❌ Vous ne pouvez pas vous envoyer d'argent à vous-même.", { reply_to_message_id: msg.message_id });
        }

        const sender = balances[senderID] || { money: 0 };
        const receiver = balances[targetID] || { money: 0, name: targetMsg.from.first_name || "Utilisateur" };

        const taxInfo = calculateTax(amount);
        if (sender.money < taxInfo.total) {
            return bot.sendMessage(chatId, `❌ Fonds insuffisants. Nécessaire : ${formatMoney(taxInfo.total)}, votre solde : ${formatMoney(sender.money)}`, { reply_to_message_id: msg.message_id });
        }

        // Mise à jour
        balances[senderID].money = sender.money - taxInfo.total;
        balances[targetID].money = (receiver.money || 0) + amount;
        balances[targetID].name = receiver.name;
        saveBalanceData(balances);

        const txId = generateTransactionID();
        const msgSuccess = 
            `✅ TRANSFERT RÉUSSI\n\n` +
            `📋 ID : ${txId}\n` +
            `👤 De : ${senderName}\n` +
            `👥 Vers : ${receiver.name}\n` +
            `💰 Montant : ${formatMoney(amount)}\n` +
            `🏛️ Taxe (${taxInfo.rate}%) : ${formatMoney(taxInfo.tax)}\n` +
            `💸 Total débité : ${formatMoney(taxInfo.total)}\n\n` +
            `💵 Nouveau solde : ${formatMoney(balances[senderID].money)}`;
        return bot.sendMessage(chatId, msgSuccess, { reply_to_message_id: msg.message_id });
    }

    // ========== CONSULTATION DE SOLDE (AVEC OU SANS REPLY) ==========
    let targetID = senderID;
    let targetName = senderName;
    if (msg.reply_to_message) {
        targetID = msg.reply_to_message.from.id;
        targetName = msg.reply_to_message.from.first_name || "Utilisateur";
    }

    // S'assurer que l'utilisateur cible existe dans la DB
    if (!balances[targetID]) balances[targetID] = { money: 0, name: targetName };
    else balances[targetID].name = targetName; // mise à jour du nom
    saveBalanceData(balances);

    const userData = balances[targetID];
    const balance = userData.money || 0;
    const tier = getTierInfo(balance);

    // Calcul du classement global
    const allUsers = Object.entries(balances).map(([id, data]) => ({ id, money: data.money || 0 }));
    const sorted = allUsers.sort((a, b) => b.money - a.money);
    const globalRank = sorted.findIndex(u => u.id === targetID) + 1;
    const totalUsers = sorted.length;
    const percentile = ((totalUsers - globalRank) / totalUsers * 100).toFixed(1);

    // ========== CRÉATION DE LA CARTE VISUELLE ==========
    const canvas = createCanvas(CONFIG.card.width, CONFIG.card.height);
    const ctx = canvas.getContext("2d");

    // Fond
    const bgGrad = ctx.createLinearGradient(0, 0, CONFIG.card.width, CONFIG.card.height);
    bgGrad.addColorStop(0, "#0a0a1f");
    bgGrad.addColorStop(0.5, "#151530");
    bgGrad.addColorStop(1, "#0f0f23");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CONFIG.card.width, CONFIG.card.height);

    // Motif étoiles
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    for (let i = 0; i < 100; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * CONFIG.card.width, Math.random() * CONFIG.card.height, Math.random() * 2 + 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Conteneur de la carte
    const card = { x: 40, y: 30, w: CONFIG.card.width - 80, h: CONFIG.card.height - 60 };
    ctx.save();
    createRoundedRect(ctx, card.x, card.y, card.w, card.h, CONFIG.card.borderRadius);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(card.x, card.y, card.w, card.h);
    ctx.restore();

    // Bordure avec glow
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 4;
    ctx.shadowColor = tier.color;
    ctx.shadowBlur = CONFIG.card.glowIntensity;
    createRoundedRect(ctx, card.x, card.y, card.w, card.h, CONFIG.card.borderRadius);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Titre
    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px Arial";
    ctx.fillText("💳 PASSEPORT FINANCIER", card.x + 40, card.y + 50);

    // Solde
    ctx.fillStyle = tier.color;
    ctx.font = "bold 56px Arial";
    ctx.textAlign = "center";
    ctx.shadowColor = tier.color;
    ctx.shadowBlur = 20;
    ctx.fillText(formatMoney(balance), card.x + card.w/2, card.y + 120);
    ctx.shadowBlur = 0;

    // Infos utilisateur
    const infoX = card.x + 40;
    const infoY = card.y + 160;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`👤 ${userData.name}`, infoX, infoY);
    ctx.fillStyle = "#aaa";
    ctx.font = "16px Arial";
    ctx.fillText(`🆔 ${targetID}`, infoX, infoY + 30);
    ctx.fillStyle = "#ffaa00";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`🏆 Classement : #${globalRank} (Top ${percentile}%)`, infoX, infoY + 60);
    ctx.fillStyle = tier.color;
    ctx.font = "bold 20px Arial";
    ctx.fillText(`${tier.badge} Tier ${tier.name}`, infoX, infoY + 90);

    // Barre de progression
    if (tier.nextTier) {
        drawProgressBar(ctx, infoX, infoY + 100, 300, 20, tier.progress, tier.color);
        ctx.fillStyle = "#aaa";
        ctx.font = "14px Arial";
        ctx.fillText(`Prochain : ${tier.nextTier.name} (${formatMoney(tier.nextTier.min - balance)} requis)`, infoX, infoY + 130);
    }

    // Avatar
    const avatar = await fetchAvatar(bot, targetID);
    const avatarX = card.x + card.w - 180;
    const avatarY = card.y + 150;
    const avatarSize = 150;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI*2);
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Billets
    const notesY = card.y + 300;
    const noteW = 80, noteH = 40;
    const denoms = [1000, 100, 10, 1];
    let noteX = card.x + 40;
    denoms.forEach(denom => {
        const count = Math.floor(balance / denom);
        if (count > 0) {
            drawBanknote(ctx, noteX, notesY, noteW, noteH, denom, tier.color);
            noteX += noteW + 20;
        }
    });

    // Pied
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "12px Arial";
    ctx.textAlign = "left";
    ctx.fillText("🏦 Système bancaire sécurisé", card.x + 40, card.y + card.h - 20);
    ctx.textAlign = "right";
    ctx.fillText("© Christus", card.x + card.w - 40, card.y + card.h - 20);

    // Sauvegarde et envoi
    const cacheDir = path.join(process.cwd(), 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `balance_${targetID}_${Date.now()}.png`);
    fs.writeFileSync(filePath, canvas.toBuffer("image/png"));

    const caption = 
        `💎 RÉSUMÉ FINANCIER\n\n` +
        `👤 Titulaire : ${userData.name}\n` +
        `💰 Solde : ${formatMoney(balance)}\n` +
        `🏆 Tier : ${tier.badge} ${tier.name}\n` +
        `📊 Classement : #${globalRank}/${totalUsers}\n` +
        `🎯 Progression : ${tier.progress.toFixed(1)}%`;

    await bot.sendPhoto(chatId, fs.createReadStream(filePath), {
        caption: caption,
        reply_to_message_id: msg.message_id
    });

    fs.unlink(filePath, (err) => {
        if (err) console.error("Erreur suppression fichier:", err);
    });
}

module.exports = { nix, onStart };