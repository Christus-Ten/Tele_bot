const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');

// Helper to get a readable stream from a URL
async function getStreamFromURL(url) {
  const response = await axios({ url, responseType: 'stream' });
  return response.data;
}

// Pinterest canvas generator (adapted from original)
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
    imageObjects.map(obj =>
      loadImage(obj.url)
        .then(img => ({ img, originalIndex: obj.originalIndex, url: obj.url }))
        .catch(e => {
          console.error(`Impossible de charger l'image : ${obj.url}`, e && e.message);
          return null;
        })
    )
  );

  const successful = loadedPairs.filter(x => x !== null);

  if (successful.length === 0) {
    ctx.fillStyle = '#ff6666';
    ctx.font = '16px Arial';
    ctx.fillText(`Aucune image n'a pu être chargée pour cette page.`, 20, 110);
    const outputPath = path.join(__dirname, 'cache', `pinterest_page_${Date.now()}.png`);
    await fs.ensureDir(path.dirname(outputPath));
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

  const outputPath = path.join(__dirname, 'cache', `pinterest_page_${Date.now()}.png`);
  await fs.ensureDir(path.dirname(outputPath));
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  return { outputPath, displayedMap };
}

const nix = {
  name: 'pinterest',
  version: '2.2',
  aliases: ['pin'],
  description: 'Rechercher des images sur Pinterest avec aperçu canvas',
  author: 'Christus (converted)',
  prefix: true,
  category: 'image',
  role: 0,
  cooldown: 10,
  guide: '{p}pinterest requête [-count]\n' +
    '• Si count est utilisé, les images sont envoyées directement.\n' +
    '• Sans count, une vue canvas interactive s\'affiche.\n' +
    '• Exemple : {p}pinterest cute cat -5 (envoi direct)\n' +
    '• Exemple : {p}pinterest anime wallpaper (vue canvas)'
};

async function onStart({ bot, message, msg, chatId, args, usages }) {
  const userId = msg.from.id;
  let processingMsgId = null;

  try {
    // Parse count argument (e.g., -5)
    let count = null;
    const countArg = args.find(arg => /^-\d+$/.test(arg));
    if (countArg) {
      count = parseInt(countArg.slice(1), 10);
      args = args.filter(arg => arg !== countArg);
    }

    const query = args.join(' ').trim();
    if (!query) {
      return bot.sendMessage(chatId, '❌ Veuillez fournir une requête de recherche.', {
        reply_to_message_id: msg.message_id
      });
    }

    // Send processing message
    const procMsg = await bot.sendMessage(chatId, '🔍 Recherche sur Pinterest...', {
      reply_to_message_id: msg.message_id
    });
    processingMsgId = procMsg.message_id;

    // Fetch images from API
    const apiUrl = `https://egret-driving-cattle.ngrok-free.app/api/pin?query=${encodeURIComponent(query)}&num=90`;
    const res = await axios.get(apiUrl);
    const allImageUrls = res.data.results || [];

    if (allImageUrls.length === 0) {
      if (processingMsgId) await bot.deleteMessage(chatId, processingMsgId).catch(() => {});
      return bot.sendMessage(chatId, `❌ Aucune image trouvée pour "${query}".`, {
        reply_to_message_id: msg.message_id
      });
    }

    // Direct download mode (with count)
    if (count) {
      const urls = allImageUrls.slice(0, count);
      const streams = await Promise.all(urls.map(url => getStreamFromURL(url).catch(() => null)));
      const validStreams = streams.filter(s => s);

      if (processingMsgId) await bot.deleteMessage(chatId, processingMsgId).catch(() => {});

      if (validStreams.length === 0) {
        return bot.sendMessage(chatId, '❌ Impossible de récupérer les images demandées.', {
          reply_to_message_id: msg.message_id
        });
      }

      // Send as media group (max 10 per group, but we can send multiple groups if needed)
      // For simplicity, we'll send a message with caption and then the photos one by one or in groups.
      // Here we'll just send a text and then each photo separately (Telegram supports up to 10 in a group, but we'll keep it simple).
      await bot.sendMessage(chatId, `✅ Voici ${validStreams.length} image(s) pour "${query}" :`, {
        reply_to_message_id: msg.message_id
      });
      for (const stream of validStreams) {
        await bot.sendPhoto(chatId, stream, {});
      }
      return;
    }

    // Canvas preview mode
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

    // Send canvas image
    const sentMsg = await bot.sendPhoto(chatId, fs.createReadStream(canvasPath), {
      caption: `🖼️ ${allImageUrls.length} images trouvées pour "${query}".\nRépondez avec un numéro (affiché sur le canvas) pour obtenir l’image, ou “next” pour plus.`,
      reply_to_message_id: msg.message_id
    });

    // Clean up temp file
    fs.unlink(canvasPath).catch(console.error);

    // Delete processing message
    if (processingMsgId) await bot.deleteMessage(chatId, processingMsgId).catch(() => {});

    // Store reply data
    global.teamnix.replies.set(sentMsg.message_id, {
      nix,
      type: 'pinterest_reply',
      threadId: chatId,
      authorId: userId,
      allImageUrls,
      query,
      imagesPerPage,
      currentPage: 1,
      totalPages,
      displayedMap,
      displayCount: displayedMap.length
    });

  } catch (error) {
    console.error(error);
    if (processingMsgId) await bot.deleteMessage(chatId, processingMsgId).catch(() => {});
    bot.sendMessage(chatId, '❌ Une erreur est survenue. Le serveur ou l\'API peut être indisponible.', {
      reply_to_message_id: msg.message_id
    });
  }
}

async function onReply({ bot, message, msg, chatId, userId, data, replyMsg }) {
  if (data.type !== 'pinterest_reply') return;
  if (userId !== data.authorId) return;

  const {
    allImageUrls,
    query,
    imagesPerPage,
    currentPage,
    totalPages,
    displayedMap,
    displayCount
  } = data;

  const input = (msg.text || '').trim().toLowerCase();

  // Handle "next" command
  if (input === 'next') {
    if (currentPage >= totalPages) {
      return bot.sendMessage(chatId, '❌ Vous êtes déjà sur la dernière page des résultats.', {
        reply_to_message_id: msg.message_id
      });
    }

    const nextPage = currentPage + 1;
    const startIndex = (nextPage - 1) * imagesPerPage;
    const endIndex = Math.min(startIndex + imagesPerPage, allImageUrls.length);
    const imagesForNextPage = allImageUrls.slice(startIndex, endIndex).map((url, idx) => ({
      url,
      originalIndex: startIndex + idx
    }));

    // Send "loading" message
    const loadingMsg = await bot.sendMessage(chatId, `⏳ Chargement de la page ${nextPage}...`, {
      reply_to_message_id: msg.message_id
    });

    const { outputPath: canvasPath, displayedMap: nextDisplayedMap } = await generatePinterestCanvas(
      imagesForNextPage,
      query,
      nextPage,
      totalPages
    );

    // Send new canvas
    const sentMsg = await bot.sendPhoto(chatId, fs.createReadStream(canvasPath), {
      caption: `🖼️ Page ${nextPage}/${totalPages}.\nRépondez avec un numéro (du canvas) pour obtenir l’image, ou “next” pour continuer.`,
      reply_to_message_id: msg.message_id
    });

    // Clean up
    fs.unlink(canvasPath).catch(console.error);
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    // Remove old reply handler and set new one
    global.teamnix.replies.delete(replyMsg.message_id);
    global.teamnix.replies.set(sentMsg.message_id, {
      nix,
      type: 'pinterest_reply',
      threadId: chatId,
      authorId: data.authorId,
      allImageUrls,
      query,
      imagesPerPage,
      currentPage: nextPage,
      totalPages,
      displayedMap: nextDisplayedMap,
      displayCount: nextDisplayedMap.length
    });

    return;
  }

  // Handle number selection
  const number = parseInt(input, 10);
  if (isNaN(number) || number <= 0) {
    return bot.sendMessage(chatId, '❌ Répondez avec un numéro (du canvas) pour obtenir l’image, ou “next” pour charger d’autres pages.', {
      reply_to_message_id: msg.message_id
    });
  }

  if (number > displayCount) {
    return bot.sendMessage(chatId, `❌ Numéro invalide. Le canvas actuel affiche seulement ${displayCount} image(s). Choisissez un numéro de 1 à ${displayCount}, ou tapez “next” pour charger plus.`, {
      reply_to_message_id: msg.message_id
    });
  }

  const originalIndex = displayedMap[number - 1];
  if (originalIndex == null || originalIndex < 0 || originalIndex >= allImageUrls.length) {
    return bot.sendMessage(chatId, '❌ Impossible de trouver cette image. Réessayez avec un autre numéro.', {
      reply_to_message_id: msg.message_id
    });
  }

  const imageUrl = allImageUrls[originalIndex];
  const stream = await getStreamFromURL(imageUrl).catch(() => null);
  if (!stream) {
    return bot.sendMessage(chatId, '❌ Impossible de récupérer l’image demandée.', {
      reply_to_message_id: msg.message_id
    });
  }

  // Send the selected image
  await bot.sendPhoto(chatId, stream, {
    caption: `Image #${number} pour la requête "${query}" :`,
    reply_to_message_id: msg.message_id
  });

  // Optionally keep the reply handler for further selections; do not delete.
}

module.exports = { onStart, onReply, nix };
