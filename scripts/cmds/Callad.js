const axios = require("axios");
const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "..", "..", "config.json");
const replyContext = new Map();

function loadConfig() {
  try {
    const configData = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configData);
    if (!config.admin) config.admin = [];
    return config;
  } catch (error) {
    console.error("Error loading config.json:", error);
    return { admin: [], prefix: "!" };
  }
}

const lang = {
  missingMessage: "Veuillez entrer le message que vous voulez envoyer à l'admin.",
  sendByGroup: "\n- Envoyé depuis le groupe : %1\n- ID du groupe : %2",
  sendByUser: "\n- Envoyé depuis un utilisateur",
  content: "\n\nContenu :\n─────────────────\n%1\n─────────────────\nRépondez à ce message pour envoyer un message à l'utilisateur.",
  success: "Votre message a été envoyé à %1 admin(s) avec succès !\n%2",
  failed: "Une erreur est survenue lors de l'envoi à %1 admin(s)\n%2\nConsultez la console pour plus de détails.",
  reply: "📍 Réponse de l'admin %1 :\n─────────────────\n%2\n─────────────────\nRépondez à ce message pour continuer à échanger avec l'admin.",
  replySuccess: "Votre réponse a été envoyée à l'admin avec succès !",
  feedback: "📝 Retour de l'utilisateur %1 :\n- ID utilisateur : %2%3\n\nContenu :\n─────────────────\n%4\n─────────────────\nRépondez à ce message pour envoyer un message à l'utilisateur.",
  replyUserSuccess: "Votre réponse a été envoyée à l'utilisateur avec succès !",
  noAdmin: "Le bot n'a actuellement aucun admin."
};

function getLang(key, ...args) {
  let str = lang[key] || key;
  args.forEach((arg, i) => {
    str = str.replace(new RegExp(`%${i+1}`, 'g'), arg);
  });
  return str;
}

async function downloadFile(fileId, bot, ext) {
  const fileLink = await bot.getFileLink(fileId);
  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `callad_${Date.now()}_${Math.random()}.${ext}`);
  const response = await axios({ method: "GET", url: fileLink, responseType: "stream" });
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
  return filePath;
}

async function sendWithAttachments(bot, chatId, text, msg, replyToMsgId = null) {
  const attachments = [];
  if (msg.photo && msg.photo.length > 0) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    attachments.push({ type: "photo", fileId });
  }
  if (msg.video) {
    attachments.push({ type: "video", fileId: msg.video.file_id });
  }
  if (msg.audio) {
    attachments.push({ type: "audio", fileId: msg.audio.file_id });
  }
  if (msg.document && msg.document.mime_type?.startsWith("image/")) {
    attachments.push({ type: "photo", fileId: msg.document.file_id });
  } else if (msg.document && msg.document.mime_type?.startsWith("video/")) {
    attachments.push({ type: "video", fileId: msg.document.file_id });
  } else if (msg.document && msg.document.mime_type?.startsWith("audio/")) {
    attachments.push({ type: "audio", fileId: msg.document.file_id });
  }

  const mainMsg = await bot.sendMessage(chatId, text, { reply_to_message_id: replyToMsgId });

  for (const att of attachments) {
    try {
      const ext = att.type === "photo" ? "jpg" : att.type === "video" ? "mp4" : "mp3";
      const filePath = await downloadFile(att.fileId, bot, ext);
      if (att.type === "photo") {
        await bot.sendPhoto(chatId, filePath, {});
      } else if (att.type === "video") {
        await bot.sendVideo(chatId, filePath, {});
      } else if (att.type === "audio") {
        await bot.sendAudio(chatId, filePath, {});
      }
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error("Failed to send attachment", e);
    }
  }

  return mainMsg;
}

const nix = {
  name: "callad",
  aliases: [],
  version: "1.7",
  author: "Christus",
  description: "Envoyer un rapport, suggestion, bug à l'admin du bot.",
  guide: ["/callad <message>", "Répondre à un message du bot pour échanger"],
  cooldown: 5,
  type: "anyone",
  category: "contacts admin",
};

async function onStart({ bot, msg, chatId, userId, args }) {
  const config = loadConfig();
  const admins = config.admin.map(String);
  const isAdmin = admins.includes(String(userId));

  const replied = msg.reply_to_message;
  const context = replied && replyContext.get(replied.message_id);

  if (context) {
    const { type, userThreadId, userMsgId, adminId } = context;
    const senderName = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : "");

    if (type === "userCallAdmin" && isAdmin) {
      const replyText = getLang("reply", senderName, args.join(" ") || " ");
      const sent = await sendWithAttachments(bot, userThreadId, replyText, msg, userMsgId);
      replyContext.set(sent.message_id, {
        type: "adminReply",
        userThreadId: adminId,
        userMsgId: sent.message_id,
        adminId: userId
      });
      await bot.sendMessage(chatId, getLang("replyUserSuccess"), { reply_to_message_id: msg.message_id });
    } else if (type === "adminReply" && !isAdmin) {
      const groupInfo = chatId > 0 ? "" : await bot.getChat(chatId).then(c => getLang("sendByGroup", c.title, chatId)).catch(() => "");
      const feedbackText = getLang("feedback", senderName, userId, groupInfo, args.join(" ") || " ");
      const sent = await sendWithAttachments(bot, adminId, feedbackText, msg);
      replyContext.set(sent.message_id, {
        type: "userCallAdmin",
        userThreadId: chatId,
        userMsgId: msg.message_id,
        adminId: userId
      });
      await bot.sendMessage(chatId, getLang("replySuccess"), { reply_to_message_id: msg.message_id });
    } else {
      await bot.sendMessage(chatId, "❌ Action non autorisée.", { reply_to_message_id: msg.message_id });
    }
    return;
  }

  if (!args.length) {
    return bot.sendMessage(chatId, getLang("missingMessage"), { reply_to_message_id: msg.message_id });
  }

  if (admins.length === 0) {
    return bot.sendMessage(chatId, getLang("noAdmin"), { reply_to_message_id: msg.message_id });
  }

  const senderName = msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : "");
  const isGroup = chatId < 0;
  const groupName = isGroup ? await bot.getChat(chatId).then(c => c.title).catch(() => "Groupe") : "";

  const header = "==📨️ APPEL ADMIN 📨️=="
    + `\n- Nom : ${senderName}`
    + `\n- ID : ${userId}`
    + (isGroup ? getLang("sendByGroup", groupName, chatId) : getLang("sendByUser"));

  const fullText = header + getLang("content", args.join(" "));

  const success = [];
  const failed = [];

  for (const adminId of admins) {
    try {
      const sent = await sendWithAttachments(bot, adminId, fullText, msg);
      replyContext.set(sent.message_id, {
        type: "userCallAdmin",
        userThreadId: chatId,
        userMsgId: msg.message_id,
        adminId: adminId
      });
      success.push(adminId);
    } catch (e) {
      failed.push(adminId);
      console.error(`Failed to send to admin ${adminId}:`, e);
    }
  }

  let resultMsg = "";
  if (success.length) {
    resultMsg += getLang("success", success.length, success.map(id => `- ${id}`).join("\n"));
  }
  if (failed.length) {
    resultMsg += getLang("failed", failed.length, failed.map(id => `- ${id}`).join("\n"));
  }
  await bot.sendMessage(chatId, resultMsg, { reply_to_message_id: msg.message_id });
}

module.exports = {
  nix,
  onStart,
};
