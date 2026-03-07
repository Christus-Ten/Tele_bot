const axios = require("axios");
const fs = require("fs");
const path = require("path");

const nix = {
  name: "imgbb",
  aliases: [],
  version: "1.0",
  author: "Christus",
  description: "Upload multiple images and get ImgBB URLs.",
  guide: ["Répondez à une ou plusieurs images avec /imgbb"],
  cooldown: 5,
  type: "anyone",
  category: "media",
};

async function onStart({ bot, msg, chatId }) {
  // Vérifier que le message est une réponse et contient des pièces jointes
  if (!msg.reply_to_message || !msg.reply_to_message.photo && !msg.reply_to_message.document) {
    return bot.sendMessage(
      chatId,
      "❌ Veuillez répondre à un message contenant une ou plusieurs images.",
      { reply_to_message_id: msg.message_id }
    );
  }

  // Envoyer un message d'attente
  const waitMsg = await bot.sendMessage(chatId, "⏳ Téléchargement des images sur ImgBB...", {
    reply_to_message_id: msg.message_id,
  });
  const waitMsgId = waitMsg.message_id;

  try {
    // Récupérer l'URL de base de l'API depuis GitHub
    const apiUrl = "https://raw.githubusercontent.com/Saim-x69x/sakura/main/ApiUrl.json";
    const { data: apiData } = await axios.get(apiUrl);
    const apiBase = apiData.saimx69x;

    // Collecter les URLs des images à uploader
    const attachments = [];
    const replied = msg.reply_to_message;

    // Photos (tableau, on prend la plus grande résolution)
    if (replied.photo) {
      const fileId = replied.photo[replied.photo.length - 1].file_id;
      const fileLink = await bot.getFileLink(fileId);
      attachments.push(fileLink);
    }

    // Documents (fichiers joints) de type image
    if (replied.document && replied.document.mime_type?.startsWith("image/")) {
      const fileLink = await bot.getFileLink(replied.document.file_id);
      attachments.push(fileLink);
    }

    if (attachments.length === 0) {
      await bot.deleteMessage(chatId, waitMsgId);
      return bot.sendMessage(
        chatId,
        "❌ Aucune image valide trouvée dans le message cité.",
        { reply_to_message_id: msg.message_id }
      );
    }

    // Traiter chaque image
    const results = [];
    for (const mediaUrl of attachments) {
      try {
        const res = await axios.get(`${apiBase}/api/imgbb?url=${encodeURIComponent(mediaUrl)}`);
        const data = res.data;
        if (data.status && data.image?.display_url) {
          results.push(data.image.display_url);
        }
      } catch (err) {
        // Ignorer les erreurs individuelles
      }
    }

    // Supprimer le message d'attente
    await bot.deleteMessage(chatId, waitMsgId);

    if (results.length === 0) {
      return bot.sendMessage(
        chatId,
        "❌ Aucune image n'a pu être uploadée sur ImgBB.",
        { reply_to_message_id: msg.message_id }
      );
    }

    // Envoyer les résultats
    const messageText = results.join("\n\n");
    await bot.sendMessage(chatId, messageText, { reply_to_message_id: msg.message_id });
  } catch (error) {
    // Nettoyer le message d'attente en cas d'erreur globale
    try {
      await bot.deleteMessage(chatId, waitMsgId);
    } catch {}

    await bot.sendMessage(
      chatId,
      `❌ Erreur : ${error.message}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

module.exports = {
  nix,
  onStart,
};
