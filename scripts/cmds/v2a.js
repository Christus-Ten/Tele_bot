const axios = require("axios");
const fs = require("fs");
const path = require("path");

const nix = {
  name: "v2a",
  aliases: ["video2audio"],
  version: "1.2",
  author: "Christus",
  description: "Convertit une vidéo en audio (renvoie le fichier vidéo avec extension .m4a).",
  guide: ["Répondez à un message contenant une vidéo avec /v2a"],
  cooldown: 0,
  type: "anyone",
  category: "media",
};

async function onStart({ bot, msg, chatId, args }) {
  if (!msg.reply_to_message) {
    return bot.sendMessage(
      chatId,
      "❌ Veuillez répondre à un message contenant une vidéo.",
      { reply_to_message_id: msg.message_id }
    );
  }

  const repliedMsg = msg.reply_to_message;

  let videoFileId = null;
  if (repliedMsg.video) {
    videoFileId = repliedMsg.video.file_id;
  } else if (repliedMsg.document && repliedMsg.document.mime_type && repliedMsg.document.mime_type.startsWith("video/")) {
    videoFileId = repliedMsg.document.file_id;
  }

  if (!videoFileId) {
    return bot.sendMessage(
      chatId,
      "❌ Le message auquel vous répondez ne contient pas de vidéo.",
      { reply_to_message_id: msg.message_id }
    );
  }

  const waitMsg = await bot.sendMessage(chatId, "⏳ Téléchargement et conversion en cours...", {
    reply_to_message_id: msg.message_id,
  });
  const waitMsgId = waitMsg.message_id;

  let tempFilePath = null;

  try {
    const fileLink = await bot.getFileLink(videoFileId);

    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    tempFilePath = path.join(tempDir, `v2a_${Date.now()}_${Math.random()}.m4a`);

    const response = await axios({
      method: "GET",
      url: fileLink,
      responseType: "stream",
      timeout: 120000,
    });

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    await bot.deleteMessage(chatId, waitMsgId);

    await bot.sendAudio(
      chatId,
      tempFilePath,
      {
        caption: "✅ Conversion terminée ! (fichier original renommé en .m4a)",
        reply_to_message_id: msg.message_id,
      },
      {
        filename: "audio.m4a",
        contentType: "audio/mp4",
      }
    );

    fs.unlinkSync(tempFilePath);
  } catch (error) {
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

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
