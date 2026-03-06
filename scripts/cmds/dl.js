const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Métadonnées de la commande
const nix = {
  name: "autodl",
  keyword: [
    "https://youtube.com",
    "https://youtu.be",
    "https://m.youtube.com",
    "https://open.spotify.com",
    "https://spotify.link",
    "https://imgur.com",
    "https://i.imgur.com",
    "https://pinterest.com",
    "https://pin.it",
    "https://imgbb.com",
    "https://ibb.co",
  ],
  aliases: ['dl'],
  version: "3.4",
  author: "Aryan Chauhan",
  description: "Download videos, audio, and images from social media.",
  guide: ["<url> ou envoyez un lien"],
  cooldown: 0,
  type: "anyone",
  category: "media",
};

// Fonction utilitaire de détection de plateforme (copiée du GoatBot)
const platformRegex = {
  youtube: /(youtube\.com|youtu\.be)/i,
  spotify: /(spotify\.com|spotify\.link)/i,
  image: /(imgur\.com|i\.imgur\.com|pinterest\.com|pin\.it|imgbb\.com|ibb\.co)/i,
};

function detectPlatform(url) {
  return {
    youtube: platformRegex.youtube.test(url),
    spotify: platformRegex.spotify.test(url),
    image: platformRegex.image.test(url),
  };
}

// Fonction principale de traitement
async function processDownload(url, bot, chatId, replyToMessageId) {
  // Envoyer un message d'attente
  const waitMsg = await bot.sendMessage(chatId, "⏳ Téléchargement en cours...", {
    reply_to_message_id: replyToMessageId,
  });
  const waitMsgId = waitMsg.message_id;

  let tempFiles = [];

  try {
    // Appel à l'API de téléchargement
    const apiResponse = await axios.get(
      `https://downvid.onrender.com/api/download?url=${encodeURIComponent(url)}`,
      { timeout: 60000 }
    );

    const data = apiResponse?.data;
    if (!data || data.status !== "success") {
      throw new Error("Échec de l'API ou lien non supporté.");
    }

    const mediaData = data?.data?.data || {};
    const videoUrl = data.video || mediaData.nowm || null;
    const audioUrl = data.audio || null;
    const imageUrl = data.image || mediaData.image || null;
    const title = mediaData.title || "Média";

    const platform = detectPlatform(url);
    let mediaToSend = null;

    // Sélection du média selon la plateforme
    if (platform.spotify) {
      if (!audioUrl) throw new Error("Aucun audio trouvé pour Spotify.");
      mediaToSend = { url: audioUrl, type: "audio", caption: "✅ Spotify Audio 🎧\n\n" };
    } else if (platform.youtube) {
      if (!videoUrl) throw new Error("Aucune vidéo trouvée pour YouTube.");
      mediaToSend = { url: videoUrl, type: "video", caption: "✅ YouTube Video 🎬\n\n" };
    } else if (platform.image) {
      if (!imageUrl && !videoUrl) throw new Error("Aucune image trouvée.");
      mediaToSend = { url: imageUrl || videoUrl, type: "photo", caption: "✅ Image 🖼️\n\n" };
    } else {
      // Autres plateformes : priorité vidéo, puis audio, puis image
      if (videoUrl) mediaToSend = { url: videoUrl, type: "video", caption: "✅ Vidéo\n\n" };
      else if (audioUrl) mediaToSend = { url: audioUrl, type: "audio", caption: "✅ Audio\n\n" };
      else if (imageUrl) mediaToSend = { url: imageUrl, type: "photo", caption: "✅ Image\n\n" };
      else throw new Error("Aucun contenu téléchargeable trouvé.");
    }

    // Création du dossier temporaire
    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Déterminer l'extension et le chemin
    const ext = mediaToSend.type === "audio" ? "mp3" : mediaToSend.type === "photo" ? "jpg" : "mp4";
    const filePath = path.join(tempDir, `autodl_${Date.now()}_${Math.random()}.${ext}`);

    // Télécharger le fichier
    const fileResponse = await axios({
      method: "GET",
      url: mediaToSend.url,
      responseType: "stream",
      timeout: 120000,
    });

    const writer = fs.createWriteStream(filePath);
    fileResponse.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    tempFiles.push(filePath);

    // Supprimer le message d'attente
    await bot.deleteMessage(chatId, waitMsgId);

    // Construire la légende finale
    const caption = `${mediaToSend.caption}📌 ${title}`;

    // Envoyer selon le type
    if (mediaToSend.type === "video") {
      await bot.sendVideo(chatId, filePath, {
        caption,
        reply_to_message_id: replyToMessageId,
      });
    } else if (mediaToSend.type === "audio") {
      await bot.sendAudio(chatId, filePath, {
        caption,
        reply_to_message_id: replyToMessageId,
      });
    } else if (mediaToSend.type === "photo") {
      await bot.sendPhoto(chatId, filePath, {
        caption,
        reply_to_message_id: replyToMessageId,
      });
    }

    // Nettoyage
    fs.unlinkSync(filePath);
  } catch (error) {
    // Nettoyer les fichiers temporaires en cas d'erreur
    tempFiles.forEach((f) => {
      try {
        fs.unlinkSync(f);
      } catch {}
    });

    // Supprimer le message d'attente s'il existe encore
    try {
      await bot.deleteMessage(chatId, waitMsgId);
    } catch {}

    // Envoyer le message d'erreur
    await bot.sendMessage(chatId, `❌ Erreur : ${error.message}`, {
      reply_to_message_id: replyToMessageId,
    });
  }
}

// Lancement explicite de la commande (ex: /autodl https://...)
async function onStart({ bot, chatId, args, msg }) {
  const url = args.join(" ").match(/https?:\/\/\S+/i)?.[0];
  if (!url) {
    await bot.sendMessage(
      chatId,
      "Envoie moi un lien YouTube, Spotify, Imgur, Pinterest ou ImgBB, et je téléchargerai le contenu pour toi !",
      { parse_mode: "HTML" }
    );
    return;
  }
  await processDownload(url, bot, chatId, msg.message_id);
}

// Détection automatique des liens dans les messages
async function onWord({ bot, msg, chatId }) {
  const messageText = msg.link_preview_options?.url || msg.text || "";
  // Vérifier si le message contient une URL correspondant à un des mots-clés
  const hasKeyword = nix.keyword.some((prefix) => messageText.startsWith(prefix));
  if (!hasKeyword) return;

  const url = messageText.match(/https?:\/\/\S+/i)?.[0];
  if (!url) return;

  await processDownload(url, bot, chatId, msg.message_id);
}

module.exports = {
  nix,
  onStart,
  onWord,
};
