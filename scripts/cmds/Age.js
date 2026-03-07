const axios = require("axios");
const moment = require("moment");

const nix = {
  name: "age",
  keyword: [],
  aliases: ["agecalc", "agecalculator"],
  version: "1.0",
  author: "𝑵𝑪-𝑺𝑨𝑰𝑴",
  description: "Calcule l'âge exact à partir d'une date de naissance.",
  guide: ["DD-MM-YYYY"],
  cooldown: 5,
  type: "anyone",
  category: "utilities",
};

const bold = (text) =>
  text.split('').map(c => {
    if (c >= 'A' && c <= 'Z') return String.fromCodePoint(c.charCodeAt(0) + 0x1D400 - 65);
    if (c >= 'a' && c <= 'z') return String.fromCodePoint(c.charCodeAt(0) + 0x1D41A - 97);
    if (c >= '0' && c <= '9') return String.fromCodePoint(c.charCodeAt(0) + 0x1D7CE - 48);
    return c;
  }).join('');

async function onStart({ bot, chatId, args, msg }) {
  try {
    if (!args[0]) {
      return await bot.sendMessage(
        chatId,
        `${bold("⚠️ Veuillez fournir votre date de naissance !")}\n\n📝 ${bold("Exemple :")} \n${bold("/age 15-03-2008")}`,
        { reply_to_message_id: msg.message_id }
      );
    }

    const inputDate = args[0];
    const birthDate = moment(inputDate, "DD-MM-YYYY", true);

    if (!birthDate.isValid()) {
      return await bot.sendMessage(
        chatId,
        `${bold("❌ Format de date invalide !")} \n${bold("Utilisez : DD-MM-YYYY")} \n${bold("Exemple : /age 15-03-2008")}`,
        { reply_to_message_id: msg.message_id }
      );
    }

    const noobcore = "https://raw.githubusercontent.com/noobcore404/NC-STORE/main/NCApiUrl.json";
    const apiRes = await axios.get(noobcore);
    const baseUrl = apiRes.data.apiv1;
    const apiBirthDate = birthDate.format("YYYY-MM-DD");

    const url = `${baseUrl}/api/age?birthDate=${apiBirthDate}`;
    const res = await axios.get(url);

    if (!res.data || !res.data.message) {
      return await bot.sendMessage(
        chatId,
        `${bold("❌ Oups ! Quelque chose s'est mal passé. Veuillez réessayer plus tard.")}`,
        { reply_to_message_id: msg.message_id }
      );
    }

    return await bot.sendMessage(chatId, res.data.message, { reply_to_message_id: msg.message_id });

  } catch (err) {
    console.error("❌ /age command error:", err);
    return await bot.sendMessage(
      chatId,
      `${bold("❌ Oups ! Quelque chose s'est mal passé. Veuillez réessayer plus tard.")}`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

module.exports = {
  nix,
  onStart,
};
