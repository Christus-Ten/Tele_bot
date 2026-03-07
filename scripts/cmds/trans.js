const axios = require('axios');

// Métadonnées de la commande
const nix = {
  name: "translate",
  keyword: [], // Pas de déclenchement automatique
  aliases: ["trans"],
  version: "1.5",
  author: "Christus",
  description: "Traduit un texte dans la langue souhaitée.",
  guide: [
    "/translate <texte> -> <code langue>",
    "ou répondez à un message avec /translate <code langue>",
    "Exemple : /translate Hello -> fr"
  ],
  cooldown: 5,
  type: "anyone",
  category: "utilities",
};

// Fonction de traduction via Google Translate
async function translate(text, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await axios.get(url);
  return {
    text: res.data[0].map(item => item[0]).join(''),
    sourceLang: res.data[2] // code de la langue source détectée
  };
}

// Gestion de la commande
async function onStart({ bot, chatId, args, msg }) {
  try {
    let content = '';
    let targetLang = 'en'; // langue par défaut (peut être modifiée)

    // Vérifier si l'utilisateur répond à un message
    if (msg.reply_to_message) {
      // Prendre le texte du message original (priorité au texte, sinon légende)
      content = msg.reply_to_message.text || msg.reply_to_message.caption || '';
      if (!content) {
        return bot.sendMessage(chatId, "❌ Le message auquel vous répondez ne contient pas de texte.", {
          reply_to_message_id: msg.message_id
        });
      }

      // Chercher un code de langue dans les arguments (ex: /translate fr)
      if (args.length > 0) {
        targetLang = args[0];
      }
    } else {
      // Pas de réponse : on prend tout le message après la commande
      const fullText = msg.text || '';
      // Extraire la partie après la commande (en enlevant le préfixe)
      const commandPrefix = '/' + nix.name; // ou selon le préfixe utilisé
      let textPart = fullText.substring(fullText.indexOf(' ') + 1).trim();

      if (!textPart) {
        return bot.sendMessage(chatId, "❌ Veuillez fournir un texte à traduire.\n\nExemple : /translate Hello -> fr", {
          reply_to_message_id: msg.message_id
        });
      }

      // Détection de la séparation "->" ou "=>"
      const separators = ['->', '=>'];
      let separatorIndex = -1;
      for (const sep of separators) {
        const idx = textPart.lastIndexOf(sep);
        if (idx !== -1 && (textPart.length - idx === sep.length + 2 || textPart.length - idx === sep.length + 3)) {
          // On suppose que la langue fait 2 ou 3 caractères après le séparateur
          separatorIndex = idx;
          break;
        }
      }

      if (separatorIndex !== -1) {
        // Extraire la langue cible (après le séparateur)
        targetLang = textPart.substring(separatorIndex + 2).trim(); // +2 pour "->"
        content = textPart.substring(0, separatorIndex).trim();
      } else {
        // Pas de séparateur : tout le texte est à traduire, langue par défaut
        content = textPart;
      }
    }

    if (!content) {
      return bot.sendMessage(chatId, "❌ Aucun texte à traduire.", {
        reply_to_message_id: msg.message_id
      });
    }

    // Envoyer un indicateur de traitement
    const waitMsg = await bot.sendMessage(chatId, "⏳ Traduction en cours...", {
      reply_to_message_id: msg.message_id
    });

    // Appeler l'API de traduction
    const { text: translatedText, sourceLang } = await translate(content, targetLang);

    // Supprimer le message d'attente
    await bot.deleteMessage(chatId, waitMsg.message_id);

    // Envoyer le résultat
    const reply = `📝 *Texte original* (${sourceLang}) :\n${content}\n\n🌐 *Traduction* (${targetLang}) :\n${translatedText}`;
    await bot.sendMessage(chatId, reply, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    });

  } catch (error) {
    console.error("Erreur dans /translate :", error);
    await bot.sendMessage(chatId, `❌ Erreur : ${error.message}`, {
      reply_to_message_id: msg.message_id
    });
  }
}

module.exports = {
  nix,
  onStart,
};
