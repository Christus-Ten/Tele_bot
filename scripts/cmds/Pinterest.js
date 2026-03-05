const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const nix = {
  name: "pinterest",
  version: "2.2",
  aliases: ["pin"],
  description: "Rechercher des images sur Pinterest avec aperçu canvas interactif",
  author: "Christus",
  prefix: true,
  category: "image",
  role: 0,
  cooldown: 10,
  guide: "{p}pin requête [-count]\n" +
         "• Si count est utilisé, les images sont envoyées directement.\n" +
         "• Sans count, une vue canvas interactive s'affiche.\n" +
         "• Exemple : {p}pin cute cat -5 (envoi direct)\n" +
         "• Exemple : {p}pin anime wallpaper (vue canvas)"
};

async function generatePinterestCanvas(imageObjects, query, page, totalPages) {
  const canvasWidth = 800;
  const canvasHeight = 1600;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = '#ffffff';
  ctx.font = '24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('🔍 Recherche Pinterest', 20, 45);

  ctx.font = '16px Arial';
  ctx.fillStyle = '#b0b0b0';
  ctx.fillText(`Résultats de recherche pour "${query}", affichant jusqu'à ${imageObjects.length} images.`, 20, 75);

  const numColumns = 3;
  const padding = 15;
  const columnWidth = (canvasWidth - (padding * (numColumns + 1))) / numColumns;
  const columnHeights = Array(numColumns).fill(100);

  const loadedPairs = await Promise.all(
    imageObjects.map(async (obj) => {
      try {
        const response = await axios.get(obj.url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        const img = await loadImage(buffer);
        return { img, originalIndex: obj.originalIndex, url: obj.url };
      } catch (e) {
        console.error(`Impossible de charger l'image : ${obj.url}`, e.message);
        return null;
      }
    })
  );

  const successful = loadedPairs.filter(x => x !== null);

  if (successful.length === 0) {
    ctx.fillStyle = '#ff6666';
    ctx.font = '16px Arial';
    ctx.fillText(`Aucune image n'a pu être chargée pour cette page.`, 20, 110);
    const outputPath = path.join(process.cwd(), 'cache', `pinterest_page_${Date.now()}.png`);
    const cacheDir = path.join(process.cwd(), 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    return { outputPath, displayedMap: [] };
  }

  let displayNumber = 0;
  const displayedMap = [];

  for (let i = 0; i < successful.length; i++) {
    const { img, originalIndex } = successful[i];

    const minHeight = Math.min(...columnHeights);
    const columnIndex = columnHeights.indexOf(minHeight);

    const x = padding + columnIndex * (columnWidth + padding);
    const y = minHeight + padding;

    const scale = columnWidth / img.width;
    const scaledHeight = img.height * scale;

    ctx.drawImage(img, x, y, columnWidth, scaledHeight);

    displayNumber += 1;
    displayedMap.push(originalIndex);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, 50, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${displayNumber}`, x + 25, y + 12);

    ctx.fillStyle = '#b0b0b0';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${img.width} x ${img.height}`, x + columnWidth - 6, y + scaledHeight - 6);

    columnHeights[columnIndex] += scaledHeight + padding;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  const footerY = Math.max(...columnHeights) + 40;
  ctx.fillText(`Anchestor - Page ${page}/${totalPages}`, canvasWidth / 2, footerY);

  const outputPath = path.join(process.cwd(), 'cache', `pinterest_page_${Date.now()}.png`);
  const cacheDir = path.join(process.cwd(), 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  return { outputPath, displayedMap };
}

async function onStart({ bot, message, msg, chatId, args, usages }) {
  let statusMsg = null;

  try {
    let count = null;
    const countArg = args.find(arg => /^-\d+$/.test(arg));
    if (countArg) {
      count = parseInt(countArg.slice(1), 10);
      args = args.filter(arg => arg !== countArg);
    }
    const query = args.join(" ").trim();
    if (!query) {
      return bot.sendMessage(chatId, "❌ Veuillez fournir une requête de recherche.", {
        reply_to_message_id: msg.message_id
      });
    }

    statusMsg = await bot.sendMessage(chatId, "🔍 Recherche sur Pinterest...", {
      reply_to_message_id: msg.message_id
    });

    const res = await axios.get(`https://egret-driving-cattle.ngrok-free.app/api/pin?query=${encodeURIComponent(query)}&num=90`);
    const allImageUrls = res.data.results || [];

    if (allImageUrls.length === 0) {
      return bot.sendMessage(chatId, `😕 Aucune image trouvée pour "${query}".`, {
        reply_to_message_id: msg.message_id
      });
    }

    if (count) {
      const urls = allImageUrls.slice(0, count);
      const media = urls.map(url => ({
        type: 'photo',
        media: url
      }));

      for (let i = 0; i < media.length; i += 10) {
        const chunk = media.slice(i, i + 10);
        await bot.sendMediaGroup(chatId, chunk, {
          reply_to_message_id: msg.message_id
        });
      }
      return;
    }

    const imagesPerPage = 21;
    const totalPages = Math.ceil(allImageUrls.length / imagesPerPage);
    const startIndex = 0;
    const endIndex = Math.min(allImageUrls.length, imagesPerPage);
    const imagesForPage1 = allImageUrls.slice(startIndex, endIndex).map((url, idx) => ({
      url,
      originalIndex: startIndex + idx
    }));

    const { outputPath: canvasPath, displayedMap } = await generatePinterestCanvas(
      imagesForPage1,
      query,
      1,
      totalPages
    );

    const sentMsg = await bot.sendPhoto(chatId, fs.createReadStream(canvasPath), {
      caption: `🖼️ ${allImageUrls.length} images trouvées pour "${query}".\nRépondez avec un numéro (affiché sur le canvas) pour obtenir l’image, ou “next” pour plus.`,
      reply_to_message_id: msg.message_id
    });

    fs.unlink(canvasPath, (err) => {
      if (err) console.error("Erreur suppression canvas:", err);
    });

    global.teamnix.replies.set(sentMsg.message_id, {
      nix,
      commandName: nix.name, // Ajout explicite du nom de la commande
      type: "pinterest_reply",
      authorId: msg.from.id,
      allImageUrls,
      query,
      imagesPerPage,
      currentPage: 1,
      totalPages,
      displayedMap,
      displayCount: displayedMap.length
    });
  } catch (err) {
    console.error("Erreur dans pinterest onStart:", err);
    bot.sendMessage(chatId, "⚠️ Une erreur est survenue. Le serveur ou l'API peut être indisponible.", {
      reply_to_message_id: msg.message_id
    });
  }
}

async function onReply({ bot, message, msg, chatId, userId, data, replyMsg }) {
  if (!data || data.type !== "pinterest_reply" || userId !== data.authorId) return;

  try {
    const input = (msg.text || "").trim().toLowerCase();

    if (input === 'next') {
      if (data.currentPage >= data.totalPages) {
        return bot.sendMessage(chatId, "📭 Vous êtes déjà sur la dernière page des résultats.", {
          reply_to_message_id: msg.message_id
        });
      }

      const nextPage = data.currentPage + 1;
      const startIndex = (nextPage - 1) * data.imagesPerPage;
      const endIndex = Math.min(startIndex + data.imagesPerPage, data.allImageUrls.length);
      const imagesForNextPage = data.allImageUrls.slice(startIndex, endIndex).map((url, idx) => ({
        url,
        originalIndex: startIndex + idx
      }));

      const loadingMsg = await bot.sendMessage(chatId, `⏳ Chargement de la page ${nextPage}...`, {
        reply_to_message_id: msg.message_id
      });

      const { outputPath: canvasPath, displayedMap: nextDisplayedMap } = await generatePinterestCanvas(
        imagesForNextPage,
        data.query,
        nextPage,
        data.totalPages
      );

      const sentMsg = await bot.sendPhoto(chatId, fs.createReadStream(canvasPath), {
        caption: `🖼️ Page ${nextPage}/${data.totalPages}.\nRépondez avec un numéro (du canvas) pour obtenir l’image, ou “next” pour continuer.`,
        reply_to_message_id: msg.message_id
      });

      fs.unlink(canvasPath, (err) => {
        if (err) console.error("Erreur suppression canvas:", err);
      });

      // Stockage explicite de toutes les données, y compris nix et commandName
      global.teamnix.replies.set(sentMsg.message_id, {
        nix: data.nix,
        commandName: data.nix.name, // Important pour que le système retrouve la commande
        type: data.type,
        authorId: data.authorId,
        allImageUrls: data.allImageUrls,
        query: data.query,
        imagesPerPage: data.imagesPerPage,
        totalPages: data.totalPages,
        currentPage: nextPage,
        displayedMap: nextDisplayedMap,
        displayCount: nextDisplayedMap.length
      });
      return;
    }

    const number = parseInt(input, 10);
    if (isNaN(number) || number <= 0) {
      return bot.sendMessage(chatId, `❌ Répondez avec un numéro (du canvas) pour obtenir l’image, ou “next” pour charger d’autres pages.`, {
        reply_to_message_id: msg.message_id
      });
    }

    if (number > data.displayCount) {
      return bot.sendMessage(chatId, `❌ Numéro invalide. Le canvas actuel affiche seulement ${data.displayCount} image(s). Choisissez un numéro de 1 à ${data.displayCount}, ou tapez “next” pour charger plus.`, {
        reply_to_message_id: msg.message_id
      });
    }

    const originalIndex = data.displayedMap[number - 1];
    if (originalIndex == null || originalIndex < 0 || originalIndex >= data.allImageUrls.length) {
      return bot.sendMessage(chatId, `❌ Impossible de trouver cette image. Réessayez avec un autre numéro.`, {
        reply_to_message_id: msg.message_id
      });
    }

    const imageUrl = data.allImageUrls[originalIndex];
    await bot.sendPhoto(chatId, imageUrl, {
      caption: `Image #${number} pour la requête "${data.query}" :`,
      reply_to_message_id: msg.message_id
    });

  } catch (err) {
    console.error("Erreur dans pinterest onReply:", err);
    bot.sendMessage(chatId, "⚠️ Une erreur est survenue lors du traitement de votre réponse.", {
      reply_to_message_id: msg.message_id
    });
  }
}

module.exports = { onStart, onReply, nix };
