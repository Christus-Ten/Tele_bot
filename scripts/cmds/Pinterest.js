const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// ======================== CONFIGURATION DU MODULE ========================
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

// ======================== FONCTIONS UTILITAIRES ========================
/**
 * Génère un canvas avec les images Pinterest pour une page donnée
 * @param {Array} imageObjects - [{ url, originalIndex }]
 * @param {string} query - Requête de recherche
 * @param {number} page - Numéro de la page
 * @param {number} totalPages - Nombre total de pages
 * @returns {Promise<{outputPath: string, displayedMap: number[]}>}
 */
async function generatePinterestCanvas(imageObjects, query, page, totalPages) {
  const canvasWidth = 800;
  const canvasHeight = 1600;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fond sombre
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Titre
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('🔍 Recherche Pinterest', 20, 45);

  // Sous‑titre
  ctx.font = '16px Arial';
  ctx.fillStyle = '#b0b0b0';
  ctx.fillText(`Résultats de recherche pour "${query}", affichant jusqu'à ${imageObjects.length} images.`, 20, 75);

  // Paramètres de la grille
  const numColumns = 3;
  const padding = 15;
  const columnWidth = (canvasWidth - (padding * (numColumns + 1))) / numColumns;
  const columnHeights = Array(numColumns).fill(100); // hauteur de départ après l'en‑tête

  // Charger toutes les images (avec gestion d'erreur)
  const loadedPairs = await Promise.all(
    imageObjects.map(async (obj) => {
      try {
        // Récupérer l'image en buffer pour éviter les problèmes CORS avec l'URL directe
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

    // Trouver la colonne la moins remplie
    const minHeight = Math.min(...columnHeights);
    const columnIndex = columnHeights.indexOf(minHeight);

    const x = padding + columnIndex * (columnWidth + padding);
    const y = minHeight + padding;

    // Redimensionner proportionnellement
    const scale = columnWidth / img.width;
    const scaledHeight = img.height * scale;

    ctx.drawImage(img, x, y, columnWidth, scaledHeight);

    displayNumber += 1;
    displayedMap.push(originalIndex);

    // Petit badge avec le numéro
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, 50, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${displayNumber}`, x + 25, y + 12);

    // Dimensions de l'image (en bas à droite)
    ctx.fillStyle = '#b0b0b0';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${img.width} x ${img.height}`, x + columnWidth - 6, y + scaledHeight - 6);

    // Mettre à jour la hauteur de la colonne
    columnHeights[columnIndex] += scaledHeight + padding;
  }

  // Pied de page avec la pagination
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'center';
  const footerY = Math.max(...columnHeights) + 40;
  ctx.fillText(`Anchestor - Page ${page}/${totalPages}`, canvasWidth / 2, footerY);

  // Sauvegarder l'image
  const outputPath = path.join(process.cwd(), 'cache', `pinterest_page_${Date.now()}.png`);
  const cacheDir = path.join(process.cwd(), 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  return { outputPath, displayedMap };
}

// ======================== GESTIONNAIRE PRINCIPAL ========================
async function onStart({ bot, message, msg, chatId, args, usages }) {
  let statusMsg = null;

  try {
    // --- Analyse des arguments ---
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

    // Message de statut
    statusMsg = await bot.sendMessage(chatId, "🔍 Recherche sur Pinterest...", {
      reply_to_message_id: msg.message_id
    });

    // --- Appel API ---
    const res = await axios.get(`https://egret-driving-cattle.ngrok-free.app/api/pin?query=${encodeURIComponent(query)}&num=90`);
    const allImageUrls = res.data.results || [];

    if (allImageUrls.length === 0) {
      return bot.sendMessage(chatId, `😕 Aucune image trouvée pour "${query}".`, {
        reply_to_message_id: msg.message_id
      });
    }

    // --- Mode envoi direct (avec -count) ---
    if (count) {
      const urls = allImageUrls.slice(0, count);
      // Créer un media group (jusqu'à 10 images par groupe, Telegram limite)
      const media = urls.map(url => ({
        type: 'photo',
        media: url
      }));

      // Envoyer par lots de 10 maximum
      for (let i = 0; i < media.length; i += 10) {
        const chunk = media.slice(i, i + 10);
        await bot.sendMediaGroup(chatId, chunk, {
          reply_to_message_id: msg.message_id
        });
      }

      // Optionnel : supprimer le message de statut
      // if (statusMsg) await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
      return;
    }

    // --- Mode canvas interactif ---
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

    // Nettoyer le fichier temporaire
    fs.unlink(canvasPath, (err) => {
      if (err) console.error("Erreur suppression canvas:", err);
    });

    // Stocker les données pour la session de reply
    global.teamnix.replies.set(sentMsg.message_id, {
      nix, // ⚠️ IMPORTANT : inclure la référence à la commande pour le système de reply
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

    // Supprimer le message de statut si souhaité
    // if (statusMsg) await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
  } catch (err) {
    console.error("Erreur dans pinterest onStart:", err);
    bot.sendMessage(chatId, "⚠️ Une erreur est survenue. Le serveur ou l'API peut être indisponible.", {
      reply_to_message_id: msg.message_id
    });
  }
}

// ======================== GESTIONNAIRE DE RÉPONSE ========================
async function onReply({ bot, message, msg, chatId, userId, data, replyMsg }) {
  // Vérifier que la réponse correspond à la session active
  if (!data || data.type !== "pinterest_reply" || userId !== data.authorId) return;

  try {
    const input = (msg.text || "").trim().toLowerCase();

    // --- Commande "next" : page suivante ---
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

      // Message de chargement
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

      // Mettre à jour la session en conservant toutes les données, y compris `nix`
      global.teamnix.replies.set(sentMsg.message_id, {
        ...data, // data contient déjà nix grâce à la session précédente
        currentPage: nextPage,
        displayedMap: nextDisplayedMap,
        displayCount: nextDisplayedMap.length
      });

      // Supprimer le message de chargement
      // await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      return;
    }

    // --- Sinon, on attend un numéro ---
    const number = parseInt(input, 10);
    if (isNaN(number) || number <= 0) {
      return bot.sendMessage(chatId, `❌ Répondez avec un numéro (du canvas) pour obtenir l’image, ou “next” pour charger d’autres pages.`, {
        reply_to_message_id: msg.message_id
      });
    }

    // Vérifier que le numéro est dans la plage affichée
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
    // Envoi direct de l'image via URL
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
